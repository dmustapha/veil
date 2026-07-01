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
pub mod nullifiers;
pub mod poseidon2;
mod ttl;

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token, Address, Bytes, Env, U256,
};

use merkle_with_history::MerkleTreeWithHistory;
use notes::{note_commitment, DS_NOTE_AVAILABLE};

/// Emitted on every deposit (deposits are public): the leaf index (topic) and its commitment.
#[contractevent]
#[derive(Clone)]
pub struct Deposit {
    #[topic]
    pub index: u32,
    pub commitment: U256,
}

/// Instance config keys.
#[contracttype]
#[derive(Clone)]
enum ConfigKey {
    /// Collateral token (a Stellar Asset Contract) the pool escrows.
    Token,
    /// Running sum of escrowed collateral — the pool's solvency floor (= Σ live note amounts).
    TotalDeposited,
}

/// Shielded note pool. Holds the Poseidon2 Merkle tree of note commitments; `deposit` escrows
/// collateral and inserts a leaf, joinsplits (lock/unlock/seize) spend + mint against it. (Nullifier
/// set + joinsplit verification wiring land in the following Phase-1/Phase-4 steps.)
#[contract]
pub struct VeilPool;

/// Widen a positive `i128` amount to a BN254 field element (16-byte BE at the low word).
fn amount_to_field(env: &Env, amount: i128) -> U256 {
    let mut b = [0u8; 32];
    b[16..].copy_from_slice(&amount.to_be_bytes());
    U256::from_be_bytes(env, &Bytes::from_array(env, &b))
}

#[contractimpl]
impl VeilPool {
    /// Deploy-time init: the collateral token + the depth-`levels` note tree. Runs atomically with
    /// deployment (a constructor), so there is no post-deploy window in which an attacker could
    /// front-run `init` to pin a malicious collateral token.
    pub fn __constructor(env: Env, token: Address, levels: u32) {
        env.storage().instance().set(&ConfigKey::Token, &token);
        env.storage().instance().set(&ConfigKey::TotalDeposited, &0i128);
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
        MerkleTreeWithHistory::init(&env, levels).expect("init");
    }

    /// Escrow `amount` of collateral and insert its AVAILABLE note commitment.
    ///
    /// The commitment is recomputed on-chain from `(amount, spend_pk, blinding)` so the escrowed
    /// collateral is provably bound to the leaf — the pool holds exactly the sum of live note
    /// amounts. Deposits are public (collateral in the clear); privacy comes from the anonymity set
    /// and the later shielded joinsplits. Returns the leaf index.
    pub fn deposit(env: Env, from: Address, amount: i128, spend_pk: U256, blinding: U256) -> u32 {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");

        // Compute the commitment (field-range checks run here) and record all state effects BEFORE
        // the external token transfer — checks-effects-interactions.
        let amount_f = amount_to_field(&env, amount);
        let zero = U256::from_u32(&env, 0);
        let commitment =
            note_commitment(&env, DS_NOTE_AVAILABLE, &amount_f, &spend_pk, &blinding, &zero);

        let index = MerkleTreeWithHistory::insert_leaf(&env, commitment.clone()).expect("insert");

        let total: i128 =
            env.storage().instance().get(&ConfigKey::TotalDeposited).unwrap_or(0);
        env.storage()
            .instance()
            .set(&ConfigKey::TotalDeposited, &total.checked_add(amount).expect("overflow"));
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);

        // Interaction last: escrow the collateral.
        let token_addr: Address =
            env.storage().instance().get(&ConfigKey::Token).expect("not initialized");
        token::TokenClient::new(&env, &token_addr).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        Deposit { index, commitment }.publish(&env);
        index
    }

    /// Total collateral escrowed (the pool's solvency floor).
    pub fn total_deposited(env: Env) -> i128 {
        env.storage().instance().get(&ConfigKey::TotalDeposited).unwrap_or(0)
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

/// Minimal storage-host contract for the internal-module tests (tree / nullifier set): they need a
/// contract context for `env.as_contract`, but not VeilPool's constructor-time tree init.
#[cfg(test)]
#[contract]
pub struct TestHost;

#[cfg(test)]
#[contractimpl]
impl TestHost {}

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
mod nullifier_hash_test {
    // Cross-impl vector for the key-derived nullifier HASH (circuit-only in v2 — computed in the
    // browser prover + the note client, never on-chain). circom `Nullifier` on (nk=5, C=7,
    // leafIndex=3) — compile `circom/nullifier_test.circom`, witness `circom/nullifier_input.json`;
    // locked in circom/README.md — must byte-match the Soroban `notes::nullifier` reference. If the
    // field order or the DS_NF-separated chain drifts, a lock/unlock/seize proof's published
    // nullifier won't match what the pool's spend path expects.
    use crate::notes::nullifier;
    use soroban_sdk::{Bytes, Env, U256};

    // circom Nullifier(nk=5, C=7, leafIndex=3).
    const EXPECTED: [u8; 32] = [
        0x0d, 0x0e, 0x7d, 0xc8, 0xc7, 0x92, 0xf3, 0x3c, 0x6c, 0xee, 0x9f, 0x8b, 0xfc, 0xd9, 0x5e,
        0x5c, 0xca, 0xed, 0x25, 0x3c, 0xa1, 0x1d, 0xbf, 0x31, 0xaa, 0x7a, 0xf6, 0xb5, 0xd7, 0x90,
        0x90, 0x13,
    ];

    #[test]
    fn soroban_nullifier_matches_circom_vector() {
        let env = Env::default();
        let nk = U256::from_u32(&env, 5);
        let commitment = U256::from_u32(&env, 7);
        let leaf_index = U256::from_u32(&env, 3);
        let nf = nullifier(&env, &nk, &commitment, &leaf_index);
        let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &EXPECTED));
        assert_eq!(nf, expected, "nullifier must byte-match circom Nullifier");
    }

    #[test]
    fn nullifier_is_domain_separated_from_commitment() {
        // DS_NF (0x20) is distinct from the note domains (0x10/0x11), so a nullifier hash can never
        // collide with a note commitment of the same first two inputs.
        use crate::notes::{note_commitment, DS_NOTE_AVAILABLE};
        let env = Env::default();
        let a = U256::from_u32(&env, 5);
        let b = U256::from_u32(&env, 7);
        let zero = U256::from_u32(&env, 0);
        let nf = nullifier(&env, &a, &b, &zero);
        let c = note_commitment(&env, DS_NOTE_AVAILABLE, &a, &b, &zero, &zero);
        assert!(nf != c, "nullifier domain must differ from note-commitment domain");
    }
}

#[cfg(test)]
mod nullifier_test {
    use crate::nullifiers::NullifierSet as N;
    use crate::TestHost;
    use soroban_sdk::{Env, U256};

    #[test]
    fn nullifier_is_single_spend() {
        let env = Env::default();
        let id = env.register(TestHost, ());
        let nf = U256::from_u32(&env, 42);

        // Fresh nullifier: not spent, spendable once.
        assert!(!env.as_contract(&id, || N::is_spent(&env, &nf)));
        assert!(env.as_contract(&id, || N::try_spend(&env, &nf)), "first spend succeeds");
        assert!(env.as_contract(&id, || N::is_spent(&env, &nf)), "now marked spent");

        // Replay is rejected; a different nullifier is unaffected.
        assert!(!env.as_contract(&id, || N::try_spend(&env, &nf)), "double-spend rejected");
        let other = U256::from_u32(&env, 43);
        assert!(!env.as_contract(&id, || N::is_spent(&env, &other)));
        assert!(env.as_contract(&id, || N::try_spend(&env, &other)), "independent nullifier spends");
    }
}

#[cfg(test)]
mod deposit_test {
    use crate::merkle_with_history::MerkleTreeWithHistory as T;
    use crate::notes::{note_commitment, DS_NOTE_AVAILABLE};
    use crate::{amount_to_field, TestHost, VeilPool, VeilPoolClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Address, Env, U256};

    #[test]
    fn deposit_escrows_collateral_and_inserts_available_commitment() {
        let env = Env::default();
        env.mock_all_auths();

        // Collateral token (SAC) + a funded user.
        let issuer = Address::generate(&env);
        let user = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let coin = token::TokenClient::new(&env, &sac.address());
        let coin_admin = token::StellarAssetClient::new(&env, &sac.address());
        coin_admin.mint(&user, &1_000_000i128);

        let id = env.register(VeilPool, (sac.address(), 16u32));
        let pool = VeilPoolClient::new(&env, &id);

        let amount = 500_000i128;
        let spend_pk = U256::from_u32(&env, 2);
        let blinding = U256::from_u32(&env, 1);
        let index = pool.deposit(&user, &amount, &spend_pk, &blinding);

        // Leaf index, escrow movement, and the solvency floor.
        assert_eq!(index, 0);
        assert_eq!(coin.balance(&user), 500_000, "collateral left the user");
        assert_eq!(coin.balance(&id), 500_000, "collateral escrowed in the pool");
        assert_eq!(pool.total_deposited(), 500_000);

        // The inserted leaf IS the AVAILABLE commitment of (amount, spend_pk, blinding, aux=0):
        // a fresh tree with that independently-computed commitment must reach the same root.
        let root = pool.root();
        assert!(pool.is_known_root(&root));

        let amount_f = amount_to_field(&env, amount);
        let expected_c = note_commitment(
            &env,
            DS_NOTE_AVAILABLE,
            &amount_f,
            &spend_pk,
            &blinding,
            &U256::from_u32(&env, 0),
        );
        let id2 = env.register(TestHost, ());
        env.as_contract(&id2, || T::init(&env, 16).unwrap());
        env.as_contract(&id2, || T::insert_leaf(&env, expected_c.clone()).unwrap());
        let expected_root = env.as_contract(&id2, || T::get_last_root(&env).unwrap());
        assert_eq!(root, expected_root, "deposited leaf must be the AVAILABLE commitment");
    }

    #[test]
    fn deposit_root_matches_circom_merkleproof_membership_vector() {
        // DEPOSIT↔CIRCUIT CONSISTENCY LOCK (deferred from Phase 1). The Soroban veil-pool root after
        // ONE deposit of the canonical AVAILABLE note (ds=0x10, amount=2e18, spendPk=2, blinding=1,
        // aux=0 → leaf 0x01c209ef…) must equal what the circom `MerkleProof(16)` computes for that
        // leaf at index 0 with the `get_zeroes[0..16]` siblings and pathIndices=0. If the on-chain
        // incremental tree and the client-side membership circuit ever diverge, a deposited note is
        // not provable in the browser — the whole pivot silently breaks. circom root pinned from
        // `merkle_proof_test.circom` (witness `merkle_proof_input.json`), locked in circom/README.md.
        let env = Env::default();
        env.mock_all_auths();
        let issuer = Address::generate(&env);
        let user = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        token::StellarAssetClient::new(&env, &sac.address())
            .mint(&user, &3_000_000_000_000_000_000i128);
        let id = env.register(VeilPool, (sac.address(), 16u32));
        let pool = VeilPoolClient::new(&env, &id);

        pool.deposit(
            &user,
            &2_000_000_000_000_000_000i128,
            &U256::from_u32(&env, 2),
            &U256::from_u32(&env, 1),
        );

        // circom MerkleProof(16) root for leaf 0x01c209ef… at index 0 with get_zeroes siblings.
        const CIRCOM_ROOT: [u8; 32] = [
            0x15, 0x0d, 0x70, 0x55, 0xc4, 0xe2, 0xe7, 0x96, 0x81, 0x4f, 0x44, 0xc6, 0xef, 0x83,
            0x25, 0x06, 0x70, 0xf7, 0xd8, 0xf0, 0xef, 0xc2, 0x01, 0x2c, 0x68, 0x3b, 0x5c, 0xee,
            0x38, 0x3b, 0xf3, 0x3c,
        ];
        let expected =
            U256::from_be_bytes(&env, &soroban_sdk::Bytes::from_array(&env, &CIRCOM_ROOT));
        assert_eq!(pool.root(), expected, "on-chain deposit root must match circom MerkleProof");
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn deposit_rejects_nonpositive_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let issuer = Address::generate(&env);
        let user = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let id = env.register(VeilPool, (sac.address(), 16u32));
        let pool = VeilPoolClient::new(&env, &id);
        pool.deposit(&user, &0i128, &U256::from_u32(&env, 2), &U256::from_u32(&env, 1));
    }

    #[test]
    #[should_panic(expected = "BN256 range")]
    fn deposit_rejects_out_of_range_field_element() {
        // A spend_pk >= the BN254 modulus can't be a valid circuit input; the field-range guard
        // fires inside note_commitment BEFORE the token transfer, so the whole deposit reverts and
        // no collateral moves.
        let env = Env::default();
        env.mock_all_auths();
        let issuer = Address::generate(&env);
        let user = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        token::StellarAssetClient::new(&env, &sac.address()).mint(&user, &1_000i128);
        let id = env.register(VeilPool, (sac.address(), 16u32));
        let pool = VeilPoolClient::new(&env, &id);

        let too_big = U256::from_be_bytes(&env, &soroban_sdk::Bytes::from_array(&env, &[0xFFu8; 32]));
        pool.deposit(&user, &500i128, &too_big, &U256::from_u32(&env, 1));
    }
}

#[cfg(test)]
mod merkle_test {
    use crate::merkle_with_history::MerkleTreeWithHistory as T;
    use crate::TestHost;
    use soroban_sdk::{Env, U256};

    // Each `as_contract` is a separate metered invocation (its own footprint budget), mirroring
    // real per-tx contract calls — otherwise the 90-root history scans accumulate past the limit.
    #[test]
    fn tree_init_insert_and_known_root() {
        let env = Env::default();
        let id = env.register(TestHost, ());

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
        let id = env.register(TestHost, ());
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

        let id1 = env.register(TestHost, ());
        env.as_contract(&id1, || T::init(&env, 16).unwrap());
        env.as_contract(&id1, || T::insert_leaf(&env, a.clone()).unwrap());
        env.as_contract(&id1, || T::insert_leaf(&env, b.clone()).unwrap());
        let root_single = env.as_contract(&id1, || T::get_last_root(&env).unwrap());

        let id2 = env.register(TestHost, ());
        env.as_contract(&id2, || T::init(&env, 16).unwrap());
        env.as_contract(&id2, || T::insert_two_leaves(&env, a.clone(), b.clone()).unwrap());
        let root_pair = env.as_contract(&id2, || T::get_last_root(&env).unwrap());

        assert_eq!(root_single, root_pair, "two single inserts must equal one pair insert");
    }

    #[test]
    fn four_single_inserts_equal_two_pair_inserts() {
        // Exercises the fold PAST level 1: leaves 2,3 make the level-1 node a right child, so this
        // covers the deeper right-child path the two-leaf test doesn't reach.
        let env = Env::default();
        let v: [u32; 4] = [11, 22, 33, 44];

        let id1 = env.register(TestHost, ());
        env.as_contract(&id1, || T::init(&env, 16).unwrap());
        for x in v {
            env.as_contract(&id1, || T::insert_leaf(&env, U256::from_u32(&env, x)).unwrap());
        }
        let root_single = env.as_contract(&id1, || T::get_last_root(&env).unwrap());

        let id2 = env.register(TestHost, ());
        env.as_contract(&id2, || T::init(&env, 16).unwrap());
        env.as_contract(&id2, || {
            T::insert_two_leaves(&env, U256::from_u32(&env, v[0]), U256::from_u32(&env, v[1])).unwrap()
        });
        env.as_contract(&id2, || {
            T::insert_two_leaves(&env, U256::from_u32(&env, v[2]), U256::from_u32(&env, v[3])).unwrap()
        });
        let root_pair = env.as_contract(&id2, || T::get_last_root(&env).unwrap());

        assert_eq!(root_single, root_pair, "four single inserts must equal two pair inserts");
    }
}
