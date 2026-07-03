// Poseidon2 (Horizen BN254) permutation for the browser prover — a faithful port of the circom
// templates in circom/poseidon2/ and the Soroban host's `poseidon2_permutation`. `compress` (t=2)
// hashes internal Merkle nodes; `hash2` (t=3) is the domain-separated primitive the note-commitment
// and nullifier chains are built on. Every output is byte-identical to its circom/Soroban twin, so a
// note committed on-chain is provable client-side (locked by the golden vectors in poseidon2.test.ts).
import {
  RC_PARTIAL_T2, RC_PARTIAL_T3, RC_FULL_T2, RC_FULL_T3, DIAG_T2, DIAG_T3,
} from "./poseidon2-constants";

/** BN254 scalar field modulus `r`. Every field op reduces mod P. */
export const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const mod = (x: bigint): bigint => ((x % P) + P) % P;

/** S-box: x^5 mod P (Poseidon2 uses α=5 over BN254). */
function sbox(x: bigint): bigint {
  const x2 = mod(x * x);
  const x4 = mod(x2 * x2);
  return mod(x4 * x);
}

interface Params {
  full: bigint[][]; // 8 rows x t
  partial: bigint[]; // 56 scalars
  diag: bigint[]; // t
}

const PARAMS: Record<number, Params> = {
  2: { full: RC_FULL_T2, partial: RC_PARTIAL_T2, diag: DIAG_T2 },
  3: { full: RC_FULL_T3, partial: RC_PARTIAL_T3, diag: DIAG_T3 },
};

// Initial linear layer for t in {2,3}: out[j] = (Σ state) + state[j]  (circom LinearLayer, t≠4).
function linearLayer(state: bigint[]): bigint[] {
  const total = state.reduce((a, b) => a + b, 0n);
  return state.map((s) => mod(total + s));
}

// External (full) round: SBox every element after adding its constant, then the t≠4 MDS mix
// out[j] = (Σ sbox) + sbox[j]  (circom ExternalRound).
function externalRound(state: bigint[], rc: bigint[]): bigint[] {
  const s = state.map((v, j) => sbox(mod(v + rc[j])));
  const total = s.reduce((a, b) => a + b, 0n);
  return s.map((v) => mod(total + v));
}

// Internal (partial) round: SBox only element 0, then the diagonal internal-matrix mix
// (circom InternalRound). total = sbox0 + Σ_{j>0} state[j]; out[0]=total+sbox0*diag[0];
// out[j>0]=total+state[j]*diag[j].
function internalRound(state: bigint[], rc: bigint, diag: bigint[]): bigint[] {
  const sb = sbox(mod(state[0] + rc));
  let total = sb;
  for (let j = 1; j < state.length; j++) total += state[j];
  return state.map((v, j) => mod(total + (j === 0 ? sb : v) * diag[j]));
}

/** The Poseidon2 permutation for t∈{2,3}: LinearLayer → 4 full → 56 partial → 4 full. */
export function permutation(inputs: bigint[]): bigint[] {
  const t = inputs.length;
  const p = PARAMS[t];
  if (!p) throw new Error(`poseidon2: unsupported width t=${t} (only 2,3)`);
  let state = linearLayer(inputs.map(mod));
  for (let k = 0; k < 4; k++) state = externalRound(state, p.full[k]);
  for (let k = 0; k < 56; k++) state = internalRound(state, p.partial[k], p.diag);
  for (let k = 4; k < 8; k++) state = externalRound(state, p.full[k]);
  return state;
}

/**
 * Poseidon2 compression of two field elements → one (circom `PoseidonCompress`, Soroban
 * `poseidon2_compress`). out = perm2([left,right])[0] + left. Used for Merkle internal nodes.
 */
export function compress(left: bigint, right: bigint): bigint {
  const out = permutation([mod(left), mod(right)]);
  return mod(out[0] + mod(left));
}

/**
 * Domain-separated 2-input hash (circom `Poseidon2(2)`, Soroban `poseidon2_hash2`).
 * out = perm3([a, b, sep])[0]. The whole note/nullifier chain is built on this.
 */
export function hash2(a: bigint, b: bigint, sep: bigint = 0n): bigint {
  return permutation([mod(a), mod(b), mod(sep)])[0];
}
