// Client-side Groth16 borrow prover + Soroban encoder for Veil v3.
//
// `proveBorrow` runs snarkjs `groth16.fullProve` in the browser (~1-3 s) against the vendored
// `borrow.wasm` + `borrow.zkey`, so the witness never leaves the device. `toSorobanProof` /
// `publicSignalsToBorrowArgs` transcode the snarkjs output into the exact byte layout the deployed
// BN254 verifier + `veil-vault.borrow` expect — the same encoding `circom/gen_fixtures.js` used for
// the Phase-3 on-chain cross-check (G1 = x||y 64B BE; G2 = x.c1||x.c0||y.c1||y.c0 128B BE; Fr 32B BE).
import type { BorrowWitness } from "./witness";

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

/** The verifier's `Vec<Bn254Fr>` public inputs: each signal as a 32B BE field element, in order. */
export function publicSignalsToFieldBytes(publicSignals: string[]): Uint8Array[] {
  return publicSignals.map((s) => fieldBytes(s));
}
