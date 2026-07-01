//! Veil v3 Soroban shielded pool (Poseidon2 / BN254, client-side-provable).
//!
//! `constants.rs` + `poseidon2.rs` + `merkle_with_history.rs` are mirrored from Nethermind
//! stellar-private-payments (Apache-2.0). GATE ZERO (see `gate_zero_test`) proves the Soroban BN254
//! Poseidon2 host fn byte-matches the Circom `PoseidonCompress`, so the on-chain tree and the
//! client-side circuit share one provably-identical hash.
#![no_std]
mod constants;
pub mod merkle_with_history;
pub mod notes;
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
mod gate_t3_test {
    // Extends GATE ZERO to the t=3 permutation (`poseidon2_hash2` = 2 inputs + domain separation),
    // which the note-commitment chain is built on. Circom `Poseidon2(2)` on inputs [1,2] with
    // domainSeparation=3 (compile `circom/hash2_test.circom`, witness `circom/hash2_input.json`)
    // must byte-match the Soroban `poseidon2_hash2(1, 2, Some(3))`. Locks the t=3 primitive before
    // any commitment code depends on it.
    use crate::poseidon2::poseidon2_hash2;
    use soroban_sdk::{Bytes, Env, U256};

    const EXPECTED: [u8; 32] = [
        0x0a, 0x79, 0x9a, 0x62, 0x1c, 0xac, 0x2c, 0xea, 0x1e, 0xc6, 0xfd, 0xbc, 0xd5, 0xdc, 0x92,
        0xca, 0xdd, 0x31, 0xc2, 0x10, 0xc9, 0x12, 0xaa, 0xca, 0x00, 0x9a, 0xca, 0x57, 0x8d, 0x21,
        0x07, 0x68,
    ];

    #[test]
    fn soroban_hash2_matches_circom_vector() {
        let env = Env::default();
        let out = poseidon2_hash2(
            &env,
            U256::from_u32(&env, 1),
            U256::from_u32(&env, 2),
            Some(U256::from_u32(&env, 3)),
        );
        let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &EXPECTED));
        assert_eq!(out, expected, "Soroban poseidon2_hash2 must byte-match Circom Poseidon2(2)");
    }
}

#[cfg(test)]
mod note_commitment_test {
    // Cross-impl vector for the note commitment. circom `NoteCommitment` on a LOCKED note
    // (ds=0x11, amount=2e18, spendPk=2, blinding=1, aux=3) — compile `circom/note_commitment_test.circom`,
    // witness `circom/note_commitment_input.json`; locked in circom/README.md — must byte-match the
    // Soroban `note_commitment`. If the field order or domain-separation chain drifts, an on-chain
    // deposit leaf won't be provable by the browser circuit.
    use crate::notes::{note_commitment, DS_NOTE_AVAILABLE, DS_NOTE_LOCKED};
    use soroban_sdk::{Bytes, Env, U256};

    // LOCKED: ds=0x11, amount=2e18, spendPk=2, blinding=1, aux=3.
    const EXPECTED_LOCKED: [u8; 32] = [
        0x1c, 0x74, 0x41, 0xb2, 0xdd, 0x96, 0x4a, 0x0b, 0x1f, 0x0f, 0x22, 0xdc, 0x59, 0x03, 0x51,
        0xce, 0xd0, 0x08, 0x2c, 0x6e, 0xdf, 0x10, 0xf7, 0xcb, 0xe2, 0x87, 0x1d, 0x0c, 0x29, 0x11,
        0x2f, 0x9a,
    ];
    // AVAILABLE (the deposit-note shape): ds=0x10, amount=2e18, spendPk=2, blinding=1, aux=0.
    const EXPECTED_AVAILABLE: [u8; 32] = [
        0x01, 0xc2, 0x09, 0xef, 0x09, 0xac, 0xd7, 0xa1, 0x81, 0xe1, 0x81, 0xb9, 0xf7, 0xe8, 0x9c,
        0xb7, 0xd5, 0x0f, 0x20, 0xae, 0xd9, 0x53, 0x45, 0xd0, 0x61, 0xc9, 0x92, 0x9a, 0x83, 0x98,
        0xe1, 0x0d,
    ];

    fn u128_to_u256(env: &Env, v: u128) -> U256 {
        let mut b = [0u8; 32];
        b[16..].copy_from_slice(&v.to_be_bytes());
        U256::from_be_bytes(env, &Bytes::from_array(env, &b))
    }

    #[test]
    fn soroban_note_commitment_matches_circom_vector() {
        let env = Env::default();
        let amount = u128_to_u256(&env, 2_000_000_000_000_000_000);
        let spend_pk = U256::from_u32(&env, 2);
        let blinding = U256::from_u32(&env, 1);
        let aux = U256::from_u32(&env, 3);
        let c = note_commitment(&env, DS_NOTE_LOCKED, &amount, &spend_pk, &blinding, &aux);
        let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &EXPECTED_LOCKED));
        assert_eq!(c, expected, "note commitment must byte-match circom NoteCommitment");
    }

    #[test]
    fn soroban_available_commitment_matches_circom_vector() {
        let env = Env::default();
        let amount = u128_to_u256(&env, 2_000_000_000_000_000_000);
        let spend_pk = U256::from_u32(&env, 2);
        let blinding = U256::from_u32(&env, 1);
        let aux = U256::from_u32(&env, 0);
        let c = note_commitment(&env, DS_NOTE_AVAILABLE, &amount, &spend_pk, &blinding, &aux);
        let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &EXPECTED_AVAILABLE));
        assert_eq!(c, expected, "AVAILABLE commitment must byte-match circom NoteCommitment");
    }

    #[test]
    fn available_and_locked_domains_are_separated() {
        // The domain tag makes a LOCKED note distinct from an AVAILABLE note of the SAME opening —
        // v2's `domain` byte, now enforced by the whole chain's separation constant.
        let env = Env::default();
        let amount = u128_to_u256(&env, 1_000);
        let pk = U256::from_u32(&env, 7);
        let b = U256::from_u32(&env, 9);
        let zero = U256::from_u32(&env, 0);
        let avail = note_commitment(&env, DS_NOTE_AVAILABLE, &amount, &pk, &b, &zero);
        let locked = note_commitment(&env, DS_NOTE_LOCKED, &amount, &pk, &b, &zero);
        assert!(avail != locked, "domain separation must distinguish AVAILABLE from LOCKED");
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

    #[test]
    fn single_insert_advances_index_and_root() {
        let env = Env::default();
        let id = env.register(VeilPool, ());
        env.as_contract(&id, || T::init(&env, 16).unwrap());
        let empty_root = env.as_contract(&id, || T::get_last_root(&env).unwrap());

        let i0 = env.as_contract(&id, || T::insert_leaf(&env, U256::from_u32(&env, 111)).unwrap());
        assert_eq!(i0, 0, "first leaf lands at index 0");
        let root0 = env.as_contract(&id, || T::get_last_root(&env).unwrap());
        assert!(root0 != empty_root, "insert must advance the root");
        assert!(env.as_contract(&id, || T::is_known_root(&env, &root0).unwrap()));

        let i1 = env.as_contract(&id, || T::insert_leaf(&env, U256::from_u32(&env, 222)).unwrap());
        assert_eq!(i1, 1, "second leaf lands at index 1");
    }

    #[test]
    fn single_insert_twice_equals_pair_insert() {
        // Cross-checks the single-leaf fold against the mirrored Nethermind pair-insert: inserting
        // a then b one-at-a-time must reach the exact same root as one insert_two_leaves(a, b).
        let env = Env::default();
        let a = U256::from_u32(&env, 111);
        let b = U256::from_u32(&env, 222);

        let id1 = env.register(VeilPool, ());
        env.as_contract(&id1, || T::init(&env, 16).unwrap());
        env.as_contract(&id1, || T::insert_leaf(&env, a.clone()).unwrap());
        env.as_contract(&id1, || T::insert_leaf(&env, b.clone()).unwrap());
        let root_single = env.as_contract(&id1, || T::get_last_root(&env).unwrap());

        let id2 = env.register(VeilPool, ());
        env.as_contract(&id2, || T::init(&env, 16).unwrap());
        env.as_contract(&id2, || T::insert_two_leaves(&env, a.clone(), b.clone()).unwrap());
        let root_pair = env.as_contract(&id2, || T::get_last_root(&env).unwrap());

        assert_eq!(root_single, root_pair, "two single inserts must equal one pair insert");
    }
}
