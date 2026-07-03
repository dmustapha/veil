// Client-side Groth16 borrow prover + Soroban encoder for Veil v3.
//
// `proveBorrow` runs snarkjs `groth16.fullProve` in the browser (~1-3 s) against the vendored
// `borrow.wasm` + `borrow.zkey`, so the witness never leaves the device. `toSorobanProof` /
// `publicSignalsToBorrowArgs` transcode the snarkjs output into the exact byte layout the deployed
// BN254 verifier + `veil-vault.borrow` expect — the same encoding `circom/gen_fixtures.js` used for
// the Phase-3 on-chain cross-check (G1 = x||y 64B BE; G2 = x.c1||x.c0||y.c1||y.c0 128B BE; Fr 32B BE).
import type { BorrowWitness } from "./witness";
import type { LockWitness } from "./lock";

/** Raw snarkjs Groth16 proof (BN254, projective triples). */
export interface SnarkProof {
  pi_a: string[]; // [x, y, "1"]
  pi_b: string[][]; // [[x.c0, x.c1], [y.c0, y.c1], ["1", "0"]]
  pi_c: string[]; // [x, y, "1"]
  protocol: string;
  curve: string;
}

/** snarkjs prove output. `publicSignals` is snarkjs order: [positionId, lockHandle, root, threshold, borrower]. */
export interface BorrowProof {
  proof: SnarkProof;
  publicSignals: string[];
}

/** Where the browser fetches the proving assets from (overridable for Node tests → fs paths). */
export interface ProverAssets {
  wasm: string;
  zkey: string;
}

const DEFAULT_ASSETS: ProverAssets = {
  wasm: "/circuits/borrow/borrow.wasm",
  zkey: "/circuits/borrow/borrow.zkey",
};

/**
 * Prove a borrow statement client-side. snarkjs computes the witness from `borrow.wasm` and proves
 * with `borrow.zkey`, entirely in-process — no server round-trip, no witness transmission. Dynamic
 * import keeps snarkjs out of the SSR/main bundle until a proof is actually requested.
 */
export async function proveBorrow(
  witness: BorrowWitness,
  assets: ProverAssets = DEFAULT_ASSETS,
): Promise<BorrowProof> {
  const snarkjs = await import("snarkjs");
  // BorrowWitness is a fixed-shape struct; snarkjs types the input as an index-signature CircuitSignals.
  const input = witness as unknown as Record<string, string | string[]>;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, assets.wasm, assets.zkey);
  return { proof: proof as unknown as SnarkProof, publicSignals: publicSignals as string[] };
}

const LOCK_ASSETS: ProverAssets = {
  wasm: "/circuits/lock/lock.wasm",
  zkey: "/circuits/lock/lock.zkey",
};

/**
 * Prove a lock statement client-side (same in-process flow as `proveBorrow`). `publicSignals` is the
 * snarkjs lock order: [nullifierOut, commitmentOut, root, lockId].
 */
export async function proveLock(
  witness: LockWitness,
  assets: ProverAssets = LOCK_ASSETS,
): Promise<BorrowProof> {
  const snarkjs = await import("snarkjs");
  const input = witness as unknown as Record<string, string | string[]>;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, assets.wasm, assets.zkey);
  return { proof: proof as unknown as SnarkProof, publicSignals: publicSignals as string[] };
}

/** The deposit-from-eth witness — the opening that binds a public note commitment `C` to a public
 *  `amount`. `spendPk`/`blinding` are the note secrets and never leave the device. Decimal strings. */
export interface DepositWitness {
  amount: string;
  C: string;
  spendPk: string;
  blinding: string;
}

const DEPOSIT_ASSETS: ProverAssets = {
  wasm: "/circuits/deposit_from_eth/deposit_from_eth.wasm",
  zkey: "/circuits/deposit_from_eth/deposit_from_eth.zkey",
};

/**
 * Prove the deposit-from-eth opening client-side. The resulting proof is verified by `VeilEthLock`
 * ON ETHEREUM at lock time (a snarkjs-exported Solidity verifier), so the WETH escrowed provably
 * matches the note commitment the user will later spend on Stellar. `publicSignals` order: [amount, C].
 */
export async function proveDepositFromEth(
  witness: DepositWitness,
  assets: ProverAssets = DEPOSIT_ASSETS,
): Promise<BorrowProof> {
  const snarkjs = await import("snarkjs");
  const input = witness as unknown as Record<string, string | string[]>;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, assets.wasm, assets.zkey);
  return { proof: proof as unknown as SnarkProof, publicSignals: publicSignals as string[] };
}

/**
 * A Groth16 proof in the calldata shape a snarkjs-generated Solidity verifier expects:
 * `verifyProof(pA[2], pB[2][2], pC[2], pubSignals[])`. Note the Fp2 coordinates in `pB` are swapped
 * (c1 before c0) — the same imaginary-first ordering the EVM `verifyProof` template uses.
 */
export interface EvmProof {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
}

/** Transcode a snarkjs proof into the EVM `verifyProof` calldata tuples (bigint, call-ready for viem). */
export function toEvmProof(p: SnarkProof): EvmProof {
  const b = (v: string) => BigInt(v);
  return {
    pA: [b(p.pi_a[0]), b(p.pi_a[1])],
    pB: [
      [b(p.pi_b[0][1]), b(p.pi_b[0][0])],
      [b(p.pi_b[1][1]), b(p.pi_b[1][0])],
    ],
    pC: [b(p.pi_c[0]), b(p.pi_c[1])],
  };
}

/** The deposit public signals as EVM `verifyProof` `pubSignals` — order [amount, C]. */
export function depositPubSignals(publicSignals: string[]): [bigint, bigint] {
  if (publicSignals.length !== 2) {
    throw new Error(`expected 2 deposit public signals, got ${publicSignals.length}`);
  }
  return [BigInt(publicSignals[0]), BigInt(publicSignals[1])];
}

/** The lock public signals, decoded and named (snarkjs emits outputs first). */
export interface LockPublicArgs {
  nullifierOut: bigint;
  commitmentOut: bigint;
  root: bigint;
  lockId: bigint;
}

/**
 * Split snarkjs `publicSignals` into the named lock public inputs. `veil-pool.lock` takes
 * `nullifier`/`commitment`/`root`/`lock_id` as separate U256 args (it burns the nullifier and inserts
 * the commitment); the verifier checks all four, in this exact order.
 */
export function publicSignalsToLockArgs(publicSignals: string[]): LockPublicArgs {
  if (publicSignals.length !== 4) {
    throw new Error(`expected 4 lock public signals, got ${publicSignals.length}`);
  }
  const [nullifierOut, commitmentOut, root, lockId] = publicSignals.map((s) => BigInt(s));
  return { nullifierOut, commitmentOut, root, lockId };
}

/** A BN254 field element as a 32-byte big-endian buffer (the on-chain `Fr` / coordinate encoding). */
export function fieldBytes(v: bigint | string): Uint8Array {
  let n = typeof v === "bigint" ? v : BigInt(v);
  if (n < 0n) throw new Error("field element must be non-negative");
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n !== 0n) throw new Error("field element exceeds 32 bytes");
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** G1 point → x||y (64B BE). */
function g1(pt: string[]): Uint8Array {
  return concat(fieldBytes(pt[0]), fieldBytes(pt[1]));
}

/** G2 point → x.c1||x.c0||y.c1||y.c0 (128B BE) — Soroban's imaginary-first ordering. */
function g2(pt: string[][]): Uint8Array {
  return concat(fieldBytes(pt[0][1]), fieldBytes(pt[0][0]), fieldBytes(pt[1][1]), fieldBytes(pt[1][0]));
}

/** Soroban `Groth16Proof` bytes: A (G1 64B), B (G2 128B), C (G1 64B), and the 256B A||B||C blob. */
export interface SorobanProof {
  a: Uint8Array; // 64
  b: Uint8Array; // 128
  c: Uint8Array; // 64
  bytes: Uint8Array; // 256 = a||b||c (the verifier's TryFrom<Bytes> form)
}

/** Transcode a snarkjs proof into the deployed verifier's byte layout. */
export function toSorobanProof(p: SnarkProof): SorobanProof {
  const a = g1(p.pi_a);
  const b = g2(p.pi_b);
  const c = g1(p.pi_c);
  return { a, b, c, bytes: concat(a, b, c) };
}

/** The borrow public signals, decoded and named (snarkjs emits outputs first). */
export interface BorrowPublicArgs {
  positionId: bigint;
  lockHandle: bigint;
  root: bigint;
  threshold: bigint;
  borrower: bigint;
}

/**
 * Split snarkjs `publicSignals` into the named borrow public inputs. The vault takes
 * `position_id`/`lock_handle`/`root`/`threshold` as separate args and re-derives the `borrower`
 * field from the caller — but the verifier checks all five, in this exact order.
 */
export function publicSignalsToBorrowArgs(publicSignals: string[]): BorrowPublicArgs {
  if (publicSignals.length !== 5) {
    throw new Error(`expected 5 borrow public signals, got ${publicSignals.length}`);
  }
  const [positionId, lockHandle, root, threshold, borrower] = publicSignals.map((s) => BigInt(s));
  return { positionId, lockHandle, root, threshold, borrower };
}

/**
 * The verifier's `Vec<Bn254Fr>` public inputs as bigints, in order. NOTE: on-chain, `Bn254Fr`
 * marshals as an ScVal **U256** (not Bytes) — encode each with `nativeToScVal(v, { type: "u256" })`
 * for a direct verifier call. (The vault's `borrow` takes position_id/lock_handle/root as U256 args
 * and rebuilds this vector itself, so most callers use `publicSignalsToBorrowArgs` instead.)
 */
export function publicSignalsToU256(publicSignals: string[]): bigint[] {
  return publicSignals.map((s) => BigInt(s));
}
