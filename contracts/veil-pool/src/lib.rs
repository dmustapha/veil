//! Veil v3 Soroban shielded pool (Poseidon2 / BN254, client-side-provable).
//!
//! `constants.rs` + `poseidon2.rs` + `merkle_with_history.rs` are mirrored from Nethermind
//! stellar-private-payments (Apache-2.0). GATE ZERO (see `gate_zero_test`) proves the Soroban BN254
//! Poseidon2 host fn byte-matches the Circom `PoseidonCompress`, so the on-chain tree and the
//! client-side circuit share one provably-identical hash.
#![no_std]
mod constants;
pub mod merkle_with_history;
pub mod poseidon2;

use soroban_sdk::{contract, contractimpl, Env, U256};

use merkle_with_history::MerkleTreeWithHistory;

/// Shielded note pool. Holds the Poseidon2 Merkle tree of note commitments; deposits insert leaves,
/// joinsplits (lock/unlock/seize) spend + mint against it. (Deposit/nullifier/joinsplit wiring lands
/// in the next Phase-1/Phase-4 steps; this shell exposes the tree primitive.)
#[contract]
pub struct VeilPool;

#[contractimpl]
impl VeilPool {
    /// One-time init of the depth-`levels` note tree.
    pub fn init(env: Env, levels: u32) {
        MerkleTreeWithHistory::init(&env, levels).expect("init");
    }

    /// Current tree root.
    pub fn root(env: Env) -> U256 {
        MerkleTreeWithHistory::get_last_root(&env).expect("root")
    }

    /// Is `root` in the recent-root history window?
    pub fn is_known_root(env: Env, root: U256) -> bool {
        MerkleTreeWithHistory::is_known_root(&env, &root).expect("is_known_root")
    }
}

#[cfg(test)]
mod gate_zero_test {
    use crate::poseidon2::poseidon2_compress;
    use soroban_sdk::{Bytes, Env, U256};

    // circom PoseidonCompress(1,2), locked in circom/README.md.
    const EXPECTED: [u8; 32] = [
        0x0e, 0x90, 0xc1, 0x32, 0x31, 0x1e, 0x86, 0x4e, 0x0c, 0x8b, 0xca, 0x37, 0x97, 0x6f, 0x28,
        0x57, 0x9a, 0x2d, 0xd9, 0x43, 0x6b, 0xbc, 0x11, 0x32, 0x6e, 0x21, 0xec, 0x7c, 0x00, 0xce,
        0xa5, 0xb3,
    ];

    #[test]
    fn soroban_poseidon2_matches_circom_vector() {
        let env = Env::default();
        let out = poseidon2_compress(&env, U256::from_u32(&env, 1), U256::from_u32(&env, 2));
        let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &EXPECTED));
        assert_eq!(out, expected, "Soroban Poseidon2 must byte-match the Circom PoseidonCompress(1,2)");
    }
}

#[cfg(test)]
mod merkle_test {
    use crate::merkle_with_history::MerkleTreeWithHistory as T;
    use crate::VeilPool;
    use soroban_sdk::{Env, U256};

    // Each `as_contract` is a separate metered invocation (its own footprint budget), mirroring
    // real per-tx contract calls — otherwise the 90-root history scans accumulate past the limit.
    #[test]
    fn tree_init_insert_and_known_root() {
        let env = Env::default();
        let id = env.register(VeilPool, ());

        env.as_contract(&id, || T::init(&env, 16).unwrap());
        let empty_root = env.as_contract(&id, || T::get_last_root(&env).unwrap());
        // Empty tree: its root is a known root.
        assert!(env.as_contract(&id, || T::is_known_root(&env, &empty_root).unwrap()));

        // Insert two note commitments at leaves 0,1.
        let (i0, i1) = env.as_contract(&id, || {
            T::insert_two_leaves(&env, U256::from_u32(&env, 111), U256::from_u32(&env, 222)).unwrap()
        });
        assert_eq!((i0, i1), (0, 1));

        // Root advances; the new root is known and the empty root stays in history.
        let new_root = env.as_contract(&id, || T::get_last_root(&env).unwrap());
        assert!(new_root != empty_root, "insert must change the root");
        assert!(env.as_contract(&id, || T::is_known_root(&env, &new_root).unwrap()));
        assert!(env.as_contract(&id, || T::is_known_root(&env, &empty_root).unwrap()));

        // A never-seen root is not known.
        assert!(!env.as_contract(&id, || T::is_known_root(&env, &U256::from_u32(&env, 999999)).unwrap()));
    }
}
