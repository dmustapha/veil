// Empty-subtree "zero" hashes for the depth-16 veil-pool note tree, derived on-device from the
// compression function so they can never drift from the on-chain table (contracts/veil-pool
// `get_zeroes`). Level 0 is the fixed zero leaf `poseidon2("XLM")` (t=4, computed once at circuit
// design time); every higher level is `compress(prev, prev)`. Cross-checked against the frozen
// on-chain decimals in zeroes.test.ts.
import { compress } from "./poseidon2";

/** The zero leaf: circom `Poseidon2` of ASCII "XLM" (t=4, domainSep=0), pinned from get_zeroes[0]. */
export const ZERO_LEAF =
  0x25302288db99350344974183ce310d63b53abb9ef0f8575753eed36e0118f9cen;

/**
 * Zero hashes for tree levels `0..=depth` (length `depth+1`): `ZERO_LEVELS[0]` is the zero leaf and
 * `ZERO_LEVELS[i] = compress(ZERO_LEVELS[i-1], ZERO_LEVELS[i-1])`. An empty depth-16 tree fills its
 * Merkle path with `ZERO_LEVELS[0..15]`.
 */
export function zeroLevels(depth = 16): bigint[] {
  const z: bigint[] = [ZERO_LEAF];
  for (let i = 0; i < depth; i++) z.push(compress(z[i], z[i]));
  return z;
}

/** Precomputed zero levels for the depth-16 pool tree (indices 0..16). */
export const ZERO_LEVELS = zeroLevels(16);
