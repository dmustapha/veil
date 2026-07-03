"use client";

/**
 * Real Soroban interactions. Every state-changing call is built locally, signed
 * by the user in Freighter, and submitted to the public testnet RPC. No secret
 * key ever touches the app: Freighter holds the key and returns a signed XDR.
 */
import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import {
  SOROBAN_RPC, TESTNET_PASSPHRASE, USDC_DECIMALS, USDC_SAC, VEIL_POOL, VEIL_VAULT,
} from "@/lib/onchain";
import { toSorobanProof, type SnarkProof } from "@/lib/prove/groth16";
import { P } from "@/lib/prove/poseidon2";
import { fetchLeafEvents, type LeafEvent } from "@/lib/prove/tree";

const server = () => new rpc.Server(SOROBAN_RPC);

/**
 * Page every leaf-insertion event the live pool has emitted, so the client can rebuild the note tree
 * on-device. The RPC only retains ~7 days of events, so we scan from a window before `latest` (well
 * inside retention, and past any real note's insertion in a live run).
 */
export async function poolLeafEvents(): Promise<LeafEvent[]> {
  const srv = server();
  const latest = (await srv.getLatestLedger()).sequence;
  const startLedger = Math.max(1, latest - 100_000);
  return fetchLeafEvents(srv, VEIL_POOL, startLedger);
}

const addrVal = (a: string) => nativeToScVal(a, { type: "address" });
const strVal = (s: string) => nativeToScVal(s, { type: "string" });
const u256Val = (v: bigint) => nativeToScVal(v, { type: "u256" });

/** A field element as a 32-byte big-endian buffer (matches Solidity `abi.encode(uint256)`). */
function be32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  if (v !== 0n) throw new Error("value exceeds 32 bytes");
  return out;
}

/** The Axelar payload VeilEthLock emits: `abi.encode(C, amount)` = 32-byte C ‖ 32-byte amount.
 *  Guards the field ranges so a non-canonical commitment (≥ the BN254 modulus — a distinct pool key)
 *  or an over-u128 amount can never be silently encoded into a message the pool would then insert. */
export function executePayload(C: bigint, amount: bigint): Uint8Array {
  if (C < 0n || C >= P) throw new Error("commitment is not a canonical BN254 field element");
  if (amount <= 0n || amount >= 1n << 128n) throw new Error("amount must be in (0, 2^128)");
  const p = new Uint8Array(64);
  p.set(be32(C), 0);
  p.set(be32(amount), 32);
  return p;
}

/** Encode a snarkjs proof as the contract's `Groth16Proof` struct (map {a,b,c: Bytes}). */
function proofScVal(proof: SnarkProof): xdr.ScVal {
  const sp = toSorobanProof(proof);
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: nativeToScVal(sp.a) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: nativeToScVal(sp.b) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: nativeToScVal(sp.c) }),
  ]);
}

/** Connect Freighter and assert the wallet is on Stellar testnet. */
export async function connectFreighter(): Promise<{
  address: string;
  network: string;
}> {
  const conn = await isConnected();
  if ("error" in conn || !conn.isConnected) throw new Error("missing");
  const access = await requestAccess();
  if ("error" in access && access.error) throw new Error("denied");
  const address =
    "address" in access && access.address
      ? access.address
      : (await getAddress()).address;
  if (!address) throw new Error("denied");
  const net = await getNetwork();
  const network = "network" in net ? net.network : "";
  return { address, network };
}

export const isTestnet = (network: string | null) =>
  (network ?? "").toUpperCase() === "TESTNET";

/** Build, sign with Freighter, submit, and confirm a Soroban invoke. */
async function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  source: string
): Promise<string> {
  const srv = server();
  const account = await srv.getAccount(source);
  const op = new Contract(contractId).call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const prepared = await srv.prepareTransaction(tx);
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: TESTNET_PASSPHRASE,
    address: source,
  });
  if (signed.error) throw new Error("Signing was rejected.");

  const signedTx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    TESTNET_PASSPHRASE
  );
  const sent = await srv.sendTransaction(signedTx);
  if (sent.status === "ERROR") {
    throw new Error("The network rejected the transaction.");
  }
  return pollResult(srv, sent.hash);
}

async function pollResult(srv: rpc.Server, hash: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await srv.getTransaction(hash);
    if (res.status === "SUCCESS") return hash;
    if (res.status === "FAILED") {
      throw new Error("The transaction failed on-chain.");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // Submitted and accepted; confirmation is just slow. Return the real hash.
  return hash;
}

/**
 * Insert the Axelar-attested AVAILABLE note into the pool. `veil-pool.execute` authenticates the
 * message against the Soroban Axelar gateway (no trusted relayer) and inserts `C`. `messageId` +
 * `sourceAddress` come from the Axelar GMP API (lib/app/axelar.ts); `payload = abi.encode(C, amount)`.
 */
export function execute(
  sourceChain: string,
  messageId: string,
  sourceAddress: string,
  C: bigint,
  amount: bigint,
  source: string,
): Promise<string> {
  const payload = nativeToScVal(executePayload(C, amount));
  return invoke(
    VEIL_POOL,
    "execute",
    [strVal(sourceChain), strVal(messageId), strVal(sourceAddress), payload],
    source,
  );
}

/**
 * Spend the AVAILABLE note and mint the LOCKED note. The client Groth16 lock proof gates it; the pool
 * burns `nullifier`, inserts `commitment`, and returns the LOCKED leaf index. Public signals order:
 * [nullifierOut, commitmentOut, root, lockId].
 */
export function lockNote(
  proof: SnarkProof,
  nullifier: bigint,
  commitment: bigint,
  root: bigint,
  lockId: bigint,
  source: string,
): Promise<string> {
  return invoke(
    VEIL_POOL,
    "lock",
    [proofScVal(proof), u256Val(nullifier), u256Val(commitment), u256Val(root), u256Val(lockId)],
    source,
  );
}

/**
 * Release the LOCKED note back to an Ethereum address after repayment. The client Groth16
 * release proof gates it; `recipient` is the raw 20-byte EVM address (BytesN<20> on Soroban).
 * Public signals order: [nullifier, c0, recipient, root_pool, root_repaid].
 */
export function releaseRepaid(
  proof: SnarkProof,
  nullifier: bigint,
  c0: bigint,
  recipient: string,
  rootPool: bigint,
  rootRepaid: bigint,
  source: string,
): Promise<string> {
  // Strip 0x prefix and hex-decode to raw 20 bytes (EVM address as Soroban BytesN<20>).
  const recipientBytes = Buffer.from(recipient.replace(/^0x/i, ""), "hex");
  if (recipientBytes.length !== 20) throw new Error("recipient must be a 20-byte EVM address");
  const recipientScVal = xdr.ScVal.scvBytes(recipientBytes);
  return invoke(
    VEIL_POOL,
    "release_repaid",
    [proofScVal(proof), u256Val(nullifier), u256Val(c0), recipientScVal, u256Val(rootPool), u256Val(rootRepaid)],
    source,
  );
}

/**
 * Read the vault's current incremental repaid-tree root (simulate-only — no signing, no fee).
 * Call this AFTER `repay` to get the updated root the release proof must prove against.
 */
export async function repaidRoot(source: string): Promise<bigint> {
  const srv = server();
  const account = await srv.getAccount(source);
  const op = new Contract(VEIL_VAULT).call("repaid_root");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();
  const result = await srv.simulateTransaction(tx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = result as any;
  if (sim.error) throw new Error(`repaid_root simulation failed: ${sim.error}`);
  const retVal = sim.result?.retval;
  if (!retVal) throw new Error("repaid_root returned no value");
  return scValToNative(retVal) as bigint;
}

/**
 * Read a position's current debt (principal + accrued interest) — simulate-only, no signing, no fee.
 * The frontend calls this immediately before `repay` to size `max_repay = debt + cushion`, so the
 * borrower→vault pull is a caller-fixed amount (stable across the Freighter sign delay).
 */
export async function debtOf(positionId: bigint, source: string): Promise<bigint> {
  const srv = server();
  const account = await srv.getAccount(source);
  const op = new Contract(VEIL_VAULT).call("debt_of", u256Val(positionId));
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();
  const result = await srv.simulateTransaction(tx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = result as any;
  if (sim.error) {
    const raw = String(sim.error);
    // Vault Error #7 = NoPosition: this position_id was never stored in the CURRENT vault — e.g. the
    // note was borrowed against an earlier deployment before a redeploy. Tag it so the UI can guide
    // the user to a fresh position instead of showing a raw HostError.
    if (/Error\(Contract,\s*#?7\)/.test(raw)) {
      throw new Error("NO_POSITION: no active loan for this position in the current lending pool");
    }
    throw new Error(`debt_of simulation failed: ${raw}`);
  }
  const retVal = sim.result?.retval;
  if (!retVal) throw new Error("debt_of returned no value");
  return scValToNative(retVal) as bigint;
}

/**
 * Repay the open borrow position. `positionId` matches the public signal emitted by `borrow`.
 * `maxRepay` is a caller-fixed upper bound on the borrower→vault pull (debt + a small cushion): the
 * vault pulls exactly `maxRepay` and refunds `maxRepay - debt` in the same call, so the transfer
 * authorization stays valid no matter how much interest accrues while the user is signing.
 */
export function repay(
  positionId: bigint,
  maxRepay: bigint,
  source: string,
): Promise<string> {
  return invoke(
    VEIL_VAULT,
    "repay",
    [u256Val(positionId), nativeToScVal(maxRepay, { type: "i128" })],
    source,
  );
}

/**
 * Prove membership of the LOCKED note above a hidden threshold and disburse real USDC. The client
 * Groth16 borrow proof gates it (fail-closed); `borrower` binds the proof to the caller (anti-replay).
 * Public signals order: [positionId, lockHandle, root, threshold, borrower].
 */
export function borrow(
  proof: SnarkProof,
  positionId: bigint,
  lockHandle: bigint,
  root: bigint,
  threshold: bigint,
  borrower: string,
): Promise<string> {
  return invoke(
    VEIL_VAULT,
    "borrow",
    [proofScVal(proof), u256Val(positionId), u256Val(lockHandle), u256Val(root), nativeToScVal(threshold, { type: "u128" }), addrVal(borrower)],
    borrower,
  );
}

/**
 * Parse a decimal token amount into integer base units WITHOUT floating point (money must be exact).
 * Rejects malformed input and more fractional digits than the token supports.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("invalid amount");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`at most ${decimals} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new Error("amount must be positive");
  return units;
}

/** Send Circle USDC (the SAC) to another Stellar address. Proves the token is real. */
export function sendUsdc(
  from: string,
  to: string,
  amountUsdc: string
): Promise<string> {
  const units = toBaseUnits(amountUsdc, USDC_DECIMALS);
  return invoke(
    USDC_SAC,
    "transfer",
    [addrVal(from), addrVal(to), nativeToScVal(units, { type: "i128" })],
    from
  );
}
