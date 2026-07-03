"use client";

/**
 * The Veil v3 on-device pipeline: it drives a shielded note from "just created" to "borrowed real
 * USDC", one on-chain step at a time, across two wallets. Every private witness is proven in the
 * browser; only proofs and public commitments ever leave the device.
 *
 *   created ─▶ locked-eth ─▶ attested ─▶ locked-note ─▶ borrowed
 *              (Ethereum)     (Stellar)    (Stellar)      (Stellar)
 *
 * The two runners are IDEMPOTENT and RESUMABLE: each reads the note's current `status` (and the live
 * WETH balance/allowance/lock) to skip work already done, and persists the note after every step. That
 * matters because the Axelar attestation between the Ethereum lock and the Stellar insert can take
 * several minutes — a reload mid-flow must be able to pick up exactly where it left off.
 */
import { parseEther, type Hex } from "viem";
import {
  approveWeth, isLocked, lockCollateral, wethAllowance, wethBalance, wrapEth,
} from "./eth";
import { waitForAxelarApproval, type AxelarMessage } from "./axelar";
import { borrow, execute, lockNote, poolLeafEvents } from "./stellar";
import { updateNote, toLockNote, toBorrowNote, type VeilNote } from "./notes";
import { AXELAR_GAS_WEI, PUBLIC_THRESHOLD_WEI } from "@/lib/onchain";
import { proveBorrow, proveDepositFromEth, proveLock, publicSignalsToBorrowArgs, publicSignalsToLockArgs, toEvmProof } from "@/lib/prove/groth16";
import { buildLockWitness } from "@/lib/prove/lock";
import { buildBorrowWitness } from "@/lib/prove/witness";
import { pathForCommitment, type MerklePath } from "@/lib/prove/tree";

/** ETH value (in ETH) a fresh note wraps as WETH — parsed to wei before it ever touches a contract. */
export const parseCollateral = (eth: string): bigint => parseEther(eth.trim());

/** The ordered steps of the open (created → attested) leg, for the UI's progress checklist. */
export const OPEN_STEPS = [
  { key: "prove", label: "Proving the deposit opening on your device" },
  { key: "wrap", label: "Wrapping ETH into WETH" },
  { key: "approve", label: "Approving the lock escrow" },
  { key: "lock", label: "Locking collateral on Ethereum" },
  { key: "attest", label: "Waiting for Axelar to attest across chains" },
  { key: "execute", label: "Inserting the shielded note on Stellar" },
] as const;

/** The ordered steps of the borrow (attested → borrowed) leg. */
export const BORROW_STEPS = [
  { key: "path-available", label: "Rebuilding your Merkle path on device" },
  { key: "prove-lock", label: "Proving the lock on your device" },
  { key: "lock-note", label: "Spending the note on Stellar" },
  { key: "prove-borrow", label: "Proving you clear the threshold on device" },
  { key: "borrow", label: "Disbursing real USDC on Stellar" },
] as const;

export type OpenStepKey = (typeof OPEN_STEPS)[number]["key"];
export type BorrowStepKey = (typeof BORROW_STEPS)[number]["key"];

/** Progress callback: the step about to run, plus an optional live detail (e.g. an Axelar sub-status). */
export type OnStep<K extends string> = (key: K, detail?: string) => void;

export interface EthDeps {
  ethAccount: Hex;
}
export interface StellarDeps {
  xlmAddress: string;
}

const numToBig = (path: MerklePath) => ({
  leafIndex: BigInt(path.leafIndex),
  pathElements: path.pathElements,
  root: path.root,
});

/**
 * Drive a freshly-created note through the Ethereum collateral leg and the Axelar attestation into the
 * pool, returning the note in the `attested` state (its AVAILABLE commitment now a pool leaf). Wraps /
 * approves only what the live balances lack, and skips the lock / attest / execute if already done.
 */
export async function runOpenPipeline(
  note: VeilNote,
  deps: EthDeps & StellarDeps,
  onStep: OnStep<OpenStepKey>,
): Promise<VeilNote> {
  const { ethAccount, xlmAddress } = deps;
  const amount = BigInt(note.amount);
  const C = BigInt(note.commitmentAvailable);
  let current = note;

  // 1. Prove the deposit opening (binds the escrowed WETH amount to the note commitment C). This proof
  //    is verified by VeilEthLock ON Ethereum at lock time, so it must be produced before the lock.
  onStep("prove");
  const deposit = await proveDepositFromEth({
    amount: note.amount, C: note.commitmentAvailable, spendPk: note.spendPk, blinding: note.blindingIn,
  });
  const evmProof = toEvmProof(deposit.proof);

  // 2. Wrap ETH → WETH, only if the account is short.
  if ((await wethBalance(ethAccount)) < amount) {
    onStep("wrap");
    await wrapEth(ethAccount, amount);
  }

  // 3. Approve the escrow to pull the WETH, only if the allowance is short.
  if ((await wethAllowance(ethAccount)) < amount) {
    onStep("approve");
    await approveWeth(ethAccount, amount);
  }

  // 4. Lock the WETH bound to C (emits the Axelar `(C, amount)` message). Skip if already locked.
  if (!(await isLocked(C))) {
    onStep("lock");
    const res = await lockCollateral(ethAccount, amount, C, evmProof, AXELAR_GAS_WEI);
    current = await applyPatch(current, { status: "locked-eth", lockTxEth: res.txHash });
  } else if (current.status === "created") {
    current = await applyPatch(current, { status: "locked-eth" });
  }

  // 5. Wait for Axelar to approve the message on the Soroban gateway, then execute it into the pool.
  if (current.status !== "attested" && current.status !== "locked-note" && current.status !== "borrowed") {
    if (!current.lockTxEth) throw new Error("missing Ethereum lock tx — re-run the lock step");
    onStep("attest");
    const msg = await waitForAxelarApproval(current.lockTxEth, {
      onUpdate: (m: AxelarMessage) => onStep("attest", axelarDetail(m)),
    });
    if (!msg.messageId || !msg.sourceAddress || !msg.sourceChain) {
      throw new Error("Axelar approved the message but omitted its id/source — cannot execute");
    }
    onStep("execute");
    const executeTx = await execute(msg.sourceChain, msg.messageId, msg.sourceAddress, C, amount, xlmAddress);
    current = await applyPatch(current, { status: "attested", executeTx });
  }

  return current;
}

/**
 * Drive an `attested` note through the shielded lock and the threshold borrow, returning it in the
 * `borrowed` state with the disbursing tx. Rebuilds the Merkle path from live pool events before each
 * proof so the public root the contract checks is a current one.
 */
export async function runBorrowPipeline(
  note: VeilNote,
  deps: StellarDeps,
  onStep: OnStep<BorrowStepKey>,
): Promise<VeilNote> {
  const { xlmAddress } = deps;
  let current = note;

  // Lock the AVAILABLE note → mint the LOCKED note (only if not already locked).
  if (current.status === "attested") {
    onStep("path-available");
    const events = await poolLeafEvents();
    const path = pathForCommitment(events, BigInt(current.commitmentAvailable), current.availableLeafIndex);

    onStep("prove-lock");
    const witness = buildLockWitness(toLockNote(current), numToBig(path));
    const { proof, publicSignals } = await proveLock(witness);
    const { nullifierOut, commitmentOut, root, lockId } = publicSignalsToLockArgs(publicSignals);
    if (commitmentOut !== BigInt(current.commitmentLocked)) {
      throw new Error("lock proof minted an unexpected commitment — note/tree mismatch");
    }

    onStep("lock-note");
    const lockTx = await lockNote(proof, nullifierOut, commitmentOut, root, lockId, xlmAddress);
    current = await applyPatch(current, { status: "locked-note", lockTx, availableLeafIndex: path.leafIndex });
  }

  // Prove the LOCKED note clears the public threshold and disburse USDC.
  if (current.status === "locked-note") {
    onStep("prove-borrow");
    const events = await poolLeafEvents();
    const path = pathForCommitment(events, BigInt(current.commitmentLocked), current.lockedLeafIndex);
    const witness = buildBorrowWitness(toBorrowNote(current), numToBig(path), PUBLIC_THRESHOLD_WEI, xlmAddress);
    const { proof, publicSignals } = await proveBorrow(witness);
    const { positionId, lockHandle, root, threshold } = publicSignalsToBorrowArgs(publicSignals);

    onStep("borrow");
    const borrowTx = await borrow(proof, positionId, lockHandle, root, threshold, xlmAddress);
    current = await applyPatch(current, { status: "borrowed", borrowTx, lockedLeafIndex: path.leafIndex });
  }

  return current;
}

/** Persist a lifecycle patch (awaited — it is the resume checkpoint) and return the merged note. */
async function applyPatch(note: VeilNote, patch: Partial<VeilNote>): Promise<VeilNote> {
  await updateNote(note.commitmentAvailable, patch);
  return { ...note, ...patch };
}

/** A short human line for the Axelar wait, from the poll status. */
function axelarDetail(m: AxelarMessage): string {
  if (m.status === "error") return m.error ?? "Axelar reported an error";
  const phase =
    m.status === "executed" || m.status === "approved" ? "approved" :
    m.status === "confirming" || m.status === "confirmed" ? "confirming the Ethereum lock" :
    m.status === "approving" ? "approving on Stellar" : m.status;
  return `Axelar: ${phase}…`;
}
