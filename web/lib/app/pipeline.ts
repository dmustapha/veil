"use client";

/**
 * The Veil v3 on-device pipeline: it drives a shielded note from "just created" to "borrowed real
 * USDC", one on-chain step at a time, across two wallets. Every private witness is proven in the
 * browser; only proofs and public commitments ever leave the device.
 *
 *   created ─▶ locked-eth ─▶ attested ─▶ locked-note ─▶ borrowed ─▶ repaid ─▶ released
 *              (Ethereum)     (Stellar)    (Stellar)      (Stellar)   (Stellar)  (Ethereum)
 *
 * All three runners are IDEMPOTENT and RESUMABLE: each reads the note's current `status` (and the live
 * WETH balance/allowance/lock) to skip work already done, and persists the note after every step. That
 * matters because the Axelar attestation between the Ethereum lock and the Stellar insert can take
 * several minutes — a reload mid-flow must be able to pick up exactly where it left off.
 */
import { keccak256, parseEther, toBytes, type Hex } from "viem";
import {
  approveWeth, isLocked, isReleased, lockCollateral, wethAllowance, wethBalance, wrapEth,
} from "./eth";
import { waitForAxelarApproval, fetchAxelarStatus, type AxelarMessage } from "./axelar";
import { borrow, debtOf, execute, lockNote, poolLeafEvents, repaidRoot, repay, releaseRepaid } from "./stellar";
import { updateNote, toLockNote, toBorrowNote, type VeilNote } from "./notes";
import { AXELAR_GAS_WEI, PUBLIC_THRESHOLD_WEI } from "@/lib/onchain";
import { proveBorrow, proveDepositFromEth, proveLock, proveRelease, publicSignalsToBorrowArgs, publicSignalsToLockArgs, publicSignalsToReleaseArgs, toEvmProof } from "@/lib/prove/groth16";
import { buildLockWitness } from "@/lib/prove/lock";
import { buildBorrowWitness, BN254_R } from "@/lib/prove/witness";
import { buildMerklePath, pathForCommitment, type MerklePath } from "@/lib/prove/tree";
import { buildReleaseWitness } from "@/lib/prove/release";
import { lockHandle, repaidLeaf, positionId as derivePositionId } from "@/lib/prove/notes";

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

/** The ordered steps of the repay (borrowed → released) reverse leg. */
export const REPAY_STEPS = [
  { key: "repay", label: "Repay USDC on Stellar" },
  { key: "prove", label: "Prove release (browser)" },
  { key: "release", label: "Submit release to the pool" },
  { key: "axelar", label: "Relay to Ethereum (Axelar)" },
  { key: "released", label: "WETH released on Sepolia" },
] as const;

export type OpenStepKey = (typeof OPEN_STEPS)[number]["key"];
export type BorrowStepKey = (typeof BORROW_STEPS)[number]["key"];
export type RepayStepKey = (typeof REPAY_STEPS)[number]["key"];

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
 * Whether the AVAILABLE note commitment `C` is already a leaf in the live pool. True once the deposit
 * has been executed onto Stellar — by our own `execute` OR by Axelar's relayer, which auto-executes the
 * forward message because gas is prepaid at lock time. We use this to avoid a duplicate `execute` (the
 * gateway rejects an already-spent message with `WasmVm/InvalidAction`).
 */
async function noteIsInPool(C: bigint): Promise<boolean> {
  try {
    const events = await poolLeafEvents();
    pathForCommitment(events, C); // throws if the commitment is not among the observed leaves
    return true;
  } catch {
    return false;
  }
}

/**
 * Confirm the note's leaf is in the pool, retrying to absorb Soroban RPC getEvents indexing lag. When
 * Axelar's relayer wins the execute race, its leaf-insertion event can take a few seconds to index, so
 * a single immediate check false-negatives. Polls a few times before giving up.
 */
async function confirmInPool(C: bigint, tries = 4, delayMs = 5000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await noteIsInPool(C)) return true;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Best-effort: fetch the DESTINATION (Stellar) execute tx hash from Axelar's GMP API for a given lock
 * tx, so the note's "Attest tx" can be shown even when Axelar's relayer (not our own execute call) won
 * the race. Returns null on any error or if it hasn't been indexed yet — never throws, since this only
 * enriches a proof link and must not block the flow.
 */
async function fetchAttestTx(lockTxEth: string): Promise<string | null> {
  try {
    const m = await fetchAxelarStatus(lockTxEth);
    return m.executeTxHash ?? null;
  } catch {
    return null;
  }
}

/** Adopt an already-in-pool note as `attested`, backfilling the Stellar execute tx (for the Attest tx
 *  proof row) if it isn't stored yet. Used on both relayer-won paths. */
async function adoptAttested(note: VeilNote): Promise<VeilNote> {
  const patch: Partial<VeilNote> = { status: "attested" };
  if (!note.executeTx && note.lockTxEth) {
    const tx = await fetchAttestTx(note.lockTxEth);
    if (tx) patch.executeTx = tx;
  }
  return applyPatch(note, patch);
}

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

    // Fast path: Axelar prepays gas at lock, so its relayer often auto-executes the deposit onto Stellar
    // before (or instead of) us. If the note leaf is already in the pool, the attestation is DONE —
    // adopt it and skip the wait + our own execute (which would be a rejected duplicate). Also the
    // correct resume path after a prior execute that landed on-chain but never got persisted.
    if (await noteIsInPool(C)) {
      current = await adoptAttested(current);
    } else {
      onStep("attest");
      const msg = await waitForAxelarApproval(current.lockTxEth, {
        onUpdate: (m: AxelarMessage) => onStep("attest", axelarDetail(m)),
      });
      if (!msg.messageId || !msg.sourceAddress || !msg.sourceChain) {
        throw new Error("Axelar approved the message but omitted its id/source — cannot execute");
      }
      onStep("execute");
      try {
        const executeTx = await execute(msg.sourceChain, msg.messageId, msg.sourceAddress, C, amount, xlmAddress);
        current = await applyPatch(current, { status: "attested", executeTx });
      } catch (err) {
        // Lost the race: Axelar's relayer executed the same message between our check and our call, so
        // the gateway rejected ours (WasmVm/InvalidAction). The relayer's leaf-insertion event can lag
        // a few seconds in the RPC index, so confirm with a short poll before deciding. If it lands,
        // that's success; if not yet, surface a CALM, resumable message (the note stays locked-eth and
        // "Continue attestation" re-adopts it) instead of the raw HostError.
        const spent = /InvalidAction|already|spent|nonce/i.test(err instanceof Error ? err.message : String(err));
        if (await confirmInPool(C, spent ? 5 : 3)) {
          current = await adoptAttested(current);
        } else if (spent) {
          throw new Error("ATTEST_PENDING: the cross-chain message was already delivered by Axelar and is finalizing on Stellar. Your collateral is locked and safe. Click Continue attestation in a moment to finish.");
        } else {
          throw err;
        }
      }
    }
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

  // Backfill the Stellar attest tx (proof row) if the relayer executed the deposit and we never stored
  // it — best-effort, so a position attested via the relayer still shows its Attest tx before borrow.
  if (current.status === "attested" && !current.executeTx && current.lockTxEth) {
    const tx = await fetchAttestTx(current.lockTxEth);
    if (tx) current = await applyPatch(current, { executeTx: tx });
  }

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

/**
 * Cushion added over the live debt when sizing `max_repay`, in USDC base units (7dp). 0.01 USDC
 * covers ~140k ledgers (~8 days) of interest at ~0.7 units/ledger — far beyond any Freighter sign
 * delay. The borrower holds this extra amount only transiently; the vault refunds the unused excess.
 */
const REPAY_CUSHION = 100_000n;

/**
 * Drive a `borrowed` note through loan repayment, the shielded release proof, the Axelar reverse hop,
 * and WETH recovery on Ethereum — returning the note in the `released` state. Fully resumable: each
 * step checks the live note status / on-chain state and skips work already done so a reload picks up
 * exactly where it left off.
 *
 * The repaid-tree path is derived analytically (our repay is always index 0 when starting from an
 * empty repaid tree; confirmed by matching ZERO_LEVELS[16] to the vault's empty repaid_root). The
 * on-chain `repaid_root` is read via a simulate call AFTER repay and used as the circuit's public root.
 */
export async function runRepayPipeline(
  note: VeilNote,
  deps: EthDeps & StellarDeps,
  onStep: OnStep<RepayStepKey>,
): Promise<VeilNote> {
  const { ethAccount, xlmAddress } = deps;
  let current = note;

  // ── Step 1: Repay ──────────────────────────────────────────────────────────
  // Repay the USDC debt. `positionId` is derived from the private `loanSecret`
  // (same formula the borrow circuit uses: H1(loanSecret, DS_POS)).
  if (current.status === "borrowed") {
    onStep("repay");
    const pid = derivePositionId(BigInt(current.loanSecret));
    // Interest accrues every ledger, so the debt at execution is higher than what the user sees when
    // Freighter signs. We pull a caller-fixed `maxRepay = debt + cushion` (auth stays valid across the
    // sign delay) and let the vault refund the unused excess. `REPAY_CUSHION` = 0.01 USDC @ 7dp, which
    // covers ~140k ledgers (~8 days) of accrual; the borrower only holds the extra 0.01 transiently.
    const debt = await debtOf(pid, xlmAddress);
    const maxRepay = debt + REPAY_CUSHION;
    const repayTx = await repay(pid, maxRepay, xlmAddress);
    current = await applyPatch(current, { status: "repaid", repayTx });
  }

  // ── Steps 2+3: Prove then Release ──────────────────────────────────────────
  // These are a single resume unit: if we die between prove and release we
  // simply reprove (deterministic given the same inputs). The `releaseTx` is
  // the resume checkpoint — once set, the proof has landed on Stellar.
  if (current.status === "repaid" && !current.releaseTx) {
    // ── Step 2: Prove ────────────────────────────────────────────────────────
    onStep("prove");

    // Pool Merkle path for the LOCKED note (C1 = commitmentLocked).
    const events = await poolLeafEvents();
    const poolPathRaw = pathForCommitment(
      events,
      BigInt(current.commitmentLocked),
      current.lockedLeafIndex,
    );
    const poolPath = numToBig(poolPathRaw);

    // Repaid-tree Merkle path. The vault starts from repaid_count==0, so our
    // repay inserts the leaf at index 0. The path siblings are all ZERO_LEVELS.
    const lh = lockHandle(BigInt(current.lockId));
    const repaidLeafVal = repaidLeaf(lh);
    const repaidPathRaw = buildMerklePath([repaidLeafVal], 0);
    // Read the actual on-chain root AFTER repay — the circuit must prove against it.
    const onChainRepaidRoot = await repaidRoot(xlmAddress);
    const repaidPath = { ...numToBig(repaidPathRaw), root: onChainRepaidRoot };

    // Recipient field: keccak256(<20-byte EVM address>) mod BN254_R.
    const recipientField = BigInt(keccak256(toBytes(ethAccount))) % BN254_R;

    // Build the release_repaid.circom witness (private fields stay on device).
    // `blindingIn` in the release circuit = `blindingOut` of the VeilNote (the LOCKED note's blinding).
    const releaseNoteForProof = {
      C0: BigInt(current.commitmentAvailable),
      amount: BigInt(current.amount),
      blindingIn: BigInt(current.blindingOut),
      spendPk: BigInt(current.spendPk),
      nk: BigInt(current.nk),
      lockId: BigInt(current.lockId),
      r: BigInt(current.r!),
    };
    const witness = buildReleaseWitness(releaseNoteForProof, poolPath, repaidPath, recipientField);
    const { proof, publicSignals } = await proveRelease(witness);
    const { nullifier, c0, rootPool, rootRepaid } = publicSignalsToReleaseArgs(publicSignals);

    // ── Step 3: Release ──────────────────────────────────────────────────────
    // `recipient` is the raw 0x hex EVM address (hex-decoded to BytesN<20> in stellar.ts).
    onStep("release");
    const releaseTx = await releaseRepaid(
      proof, nullifier, c0, ethAccount, rootPool, rootRepaid, xlmAddress,
    );
    current = await applyPatch(current, { releaseTx });
  }

  // ── Step 4: Axelar ─────────────────────────────────────────────────────────
  // Poll the GMP API until the Stellar release message is approved on Ethereum.
  if (current.status === "repaid" && current.releaseTx) {
    onStep("axelar");
    await waitForAxelarApproval(current.releaseTx, {
      onUpdate: (m: AxelarMessage) => onStep("axelar", axelarDetail(m)),
    });
  }

  // ── Step 5: Released ───────────────────────────────────────────────────────
  // Poll VeilEthLock.isReleased(C0) until the Axelar executor delivers the WETH.
  if (current.status !== "released") {
    onStep("released");
    const c0 = BigInt(current.commitmentAvailable);
    let wethReleased = false;
    for (let i = 0; i < 40; i++) {
      if (await isReleased(c0)) { wethReleased = true; break; }
      await new Promise<void>((r) => setTimeout(r, 15_000));
    }
    if (!wethReleased) {
      throw new Error("WETH release not yet confirmed on Ethereum (Axelar hop still in flight). Retry to resume — the release is already submitted, so this only re-polls.");
    }
    current = await applyPatch(current, { status: "released" });
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
  if (m.gasShort) return "Topping up Axelar gas for delivery — this usually clears on its own…";
  const phase =
    m.status === "executed" || m.status === "approved" ? "approved" :
    m.status === "confirming" || m.status === "confirmed" ? "confirming the Ethereum lock" :
    m.status === "approving" ? "approving on Stellar" : m.status;
  return `Axelar: ${phase}…`;
}
