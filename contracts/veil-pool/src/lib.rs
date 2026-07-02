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

#[cfg(feature = "contract")]
use soroban_sdk::{
    contract, contractclient, contractevent, contractimpl, contracttype, crypto::bn254::Bn254Fr,
    token, Address, Bytes, BytesN, Env, Vec, U256,
};

#[cfg(feature = "contract")]
use merkle_with_history::MerkleTreeWithHistory;
#[cfg(feature = "contract")]
use notes::{note_commitment, DS_NOTE_AVAILABLE};
#[cfg(feature = "contract")]
use nullifiers::NullifierSet;
#[cfg(feature = "contract")]
use veil_verifier::{Groth16Error, Groth16Proof};

/// Emitted on every deposit (deposits are public): the leaf index (topic) and its commitment.
#[cfg(feature = "contract")]
#[contractevent]
#[derive(Clone)]
pub struct Deposit {
    #[topic]
    pub index: u32,
    pub commitment: U256,
}

/// Emitted on every note-spend joinsplit (lock/unlock/seize): the consumed nullifier (topic) and the
/// first minted leaf (index + commitment). For `seize` a change leaf follows at `index + 1`. Lets an
/// indexer rebuild the tree from deposits + spends without recomputing any secret.
#[cfg(feature = "contract")]
#[contractevent]
#[derive(Clone)]
pub struct Spent {
    #[topic]
    pub nullifier: U256,
    pub index: u32,
    pub commitment: U256,
}

/// Emitted on every relayer attestation of an Ethereum-backed lock (cross-chain deposit). Public
/// like a normal deposit: the leaf index (topic), its commitment, and the WETH amount it is backed by.
#[cfg(feature = "contract")]
#[contractevent]
#[derive(Clone)]
pub struct AttestLock {
    #[topic]
    pub index: u32,
    pub commitment: U256,
    pub amount: i128,
}

/// Instance config keys.
#[cfg(feature = "contract")]
#[contracttype]
#[derive(Clone)]
enum ConfigKey {
    /// Collateral token (a Stellar Asset Contract) the pool escrows.
    Token,
    /// Running sum of escrowed collateral — the pool's solvency floor (= Σ live note amounts).
    TotalDeposited,
    /// Admin (may set the vault once, post-deploy — resolves the pool↔vault deploy cycle).
    Admin,
    /// Deployed Groth16 verifiers, one per note-spend joinsplit circuit.
    LockVerifier,
    UnlockVerifier,
    SeizeVerifier,
    /// The veil-vault, source of the repaid/liquidated gating roots that unlock/seize prove against.
    Vault,
    /// The cross-chain relayer allowed to call `attest_lock` (mirrors real Ethereum WETH locks).
    Relayer,
}

/// Persistent guard against double-attesting the same Ethereum-backed commitment. Presence means the
/// commitment was already mirrored into the tree — re-attesting it would mint a second note backed by
/// one Ethereum lock (each leaf gets a distinct nullifier via its index → double-borrow). See 7e.
#[cfg(feature = "contract")]
#[contracttype]
#[derive(Clone)]
enum AttestKey {
    Attested(U256),
}

/// A deployed Groth16 verifier. `verify` returns `Ok(true)` on a valid proof and TRAPS (reverts) on
/// an invalid proof or mismatched public inputs — public inputs in snarkjs order.
#[cfg(feature = "contract")]
#[contractclient(name = "VerifierClient")]
pub trait VerifierIface {
    fn verify(
        env: Env,
        proof: Groth16Proof,
        public_inputs: Vec<Bn254Fr>,
    ) -> Result<bool, Groth16Error>;
}

/// The veil-vault — publishes the Poseidon repaid/liquidated gating roots. unlock proves membership
/// against `repaid_root`, seize against `liquidated_root` (collateral is recoverable/seizable only
/// after the vault has recorded the repayment / liquidation).
#[cfg(feature = "contract")]
#[contractclient(name = "VaultClient")]
pub trait VaultIface {
    fn repaid_root(env: Env) -> U256;
    fn liquidated_root(env: Env) -> U256;
}

/// Shielded note pool. Holds the Poseidon2 Merkle tree of note commitments; `deposit` escrows
/// collateral and inserts a leaf, joinsplits (lock/unlock/seize) spend + mint against it. (Nullifier
/// set + joinsplit verification wiring land in the following Phase-1/Phase-4 steps.)
#[cfg(feature = "contract")]
#[contract]
pub struct VeilPool;

/// BN254 scalar field modulus `r` (big-endian). Spend inputs are field elements; `Bn254Fr::from_bytes`
/// reduces mod `r`, but the nullifier set / tree key on the raw `U256` — so a non-canonical
/// representative (`nf + r`) would be a distinct key yet the SAME field element, re-verifying the same
/// proof (double-spend). Every field input is range-rejected against this before use. See audit C-01.
#[cfg(feature = "contract")]
const BN254_R: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// Widen a positive `i128` amount to a BN254 field element (16-byte BE at the low word).
#[cfg(feature = "contract")]
fn amount_to_field(env: &Env, amount: i128) -> U256 {
    let mut b = [0u8; 32];
    b[16..].copy_from_slice(&amount.to_be_bytes());
    U256::from_be_bytes(env, &Bytes::from_array(env, &b))
}

#[cfg(feature = "contract")]
#[contractimpl]
impl VeilPool {
    /// Deploy-time init: the collateral token + the depth-`levels` note tree. Runs atomically with
    /// deployment (a constructor), so there is no post-deploy window in which an attacker could
    /// front-run `init` to pin a malicious collateral token.
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        levels: u32,
        lock_verifier: Address,
        unlock_verifier: Address,
        seize_verifier: Address,
    ) {
        let s = env.storage().instance();
        s.set(&ConfigKey::Admin, &admin);
        s.set(&ConfigKey::Token, &token);
        s.set(&ConfigKey::TotalDeposited, &0i128);
        s.set(&ConfigKey::LockVerifier, &lock_verifier);
        s.set(&ConfigKey::UnlockVerifier, &unlock_verifier);
        s.set(&ConfigKey::SeizeVerifier, &seize_verifier);
        s.extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
        MerkleTreeWithHistory::init(&env, levels).expect("init");
    }

    /// Bind the veil-vault whose gating roots unlock/seize prove against. Admin-gated and ONE-TIME
    /// (resolves the pool↔vault deploy cycle: deploy pool, deploy vault with the pool address, then
    /// call this once). Rejects a second call so the binding can't be swapped later.
    pub fn set_vault(env: Env, vault: Address) {
        let admin: Address =
            env.storage().instance().get(&ConfigKey::Admin).expect("not initialized");
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&ConfigKey::Vault),
            "vault already set"
        );
        env.storage().instance().set(&ConfigKey::Vault, &vault);
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
    }

    /// Bind the cross-chain relayer allowed to call `attest_lock`. Admin-gated and ONE-TIME (mirrors
    /// `set_vault`): the relayer mirrors real Ethereum WETH locks into this pool, so the binding must
    /// not be swappable after deploy.
    pub fn set_relayer(env: Env, relayer: Address) {
        let admin: Address =
            env.storage().instance().get(&ConfigKey::Admin).expect("not initialized");
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&ConfigKey::Relayer),
            "relayer already set"
        );
        env.storage().instance().set(&ConfigKey::Relayer, &relayer);
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
    }

    /// Cross-chain deposit: mirror a real Ethereum WETH lock into the pool. The relayer (having
    /// observed a `VeilEthLock.Locked(commitment, amount, …)` event on Sepolia — where an on-chain
    /// Groth16 opening proof already bound `commitment` to exactly `amount`) inserts the AVAILABLE
    /// note `commitment` into the tree and records `amount` as backing (the pool's solvency floor).
    /// NO Stellar token is escrowed — the collateral is the Ethereum lock. Relayer-gated and
    /// idempotent per commitment (a re-attest of the same lock is rejected, else one Ethereum lock
    /// would mint two borrowable notes). Returns the leaf index.
    pub fn attest_lock(env: Env, commitment: U256, amount: i128) -> u32 {
        let relayer: Address =
            env.storage().instance().get(&ConfigKey::Relayer).expect("relayer not set");
        relayer.require_auth();
        assert!(amount > 0, "amount must be positive");
        Self::require_canonical(&env, &commitment);

        // One attestation per commitment (matches VeilEthLock's one-lock-per-commitment).
        let ak = AttestKey::Attested(commitment.clone());
        assert!(!env.storage().persistent().has(&ak), "commitment already attested");

        let index = MerkleTreeWithHistory::insert_leaf(&env, commitment.clone()).expect("insert");

        let total: i128 = env.storage().instance().get(&ConfigKey::TotalDeposited).unwrap_or(0);
        env.storage()
            .instance()
            .set(&ConfigKey::TotalDeposited, &total.checked_add(amount).expect("overflow"));
        env.storage().persistent().set(&ak, &true);
        ttl::bump(&env, &ak);
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);

        AttestLock { index, commitment, amount }.publish(&env);
        index
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

    /// LOCK joinsplit: spend an AVAILABLE note (proved a member of a known pool `root`, its nullifier
    /// published) and mint a LOCKED note `commitment` of the SAME amount, bound to `lock_id`. The
    /// lock proof enforces value conservation in-circuit; the pool checks the root, burns the
    /// nullifier (single-spend), and inserts the new leaf. Returns the new leaf index.
    pub fn lock(
        env: Env,
        proof: Groth16Proof,
        nullifier: U256,
        commitment: U256,
        root: U256,
        lock_id: U256,
    ) -> u32 {
        for v in [&nullifier, &commitment, &root, &lock_id] {
            Self::require_canonical(&env, v);
        }
        // Public signals in snarkjs order: [nullifierOut, commitmentOut, root, lockId].
        let mut pi: Vec<Bn254Fr> = Vec::new(&env);
        pi.push_back(Self::fr(&env, &nullifier));
        pi.push_back(Self::fr(&env, &commitment));
        pi.push_back(Self::fr(&env, &root));
        pi.push_back(Self::fr(&env, &lock_id));
        Self::verify(&env, ConfigKey::LockVerifier, &proof, &pi);

        assert!(Self::known_root(&env, &root), "unknown pool root");
        assert!(NullifierSet::try_spend(&env, &nullifier), "nullifier already spent");
        Self::insert_spend(&env, nullifier, commitment)
    }

    /// UNLOCK joinsplit: spend a LOCKED note (member of a known pool `root_pool`) and mint an
    /// AVAILABLE note `commitment`, GATED on the repayment — `root_repaid` must equal the vault's
    /// current repaid-root (the vault appends `repaid_leaf` on repay; the circuit proves membership).
    /// So collateral is recoverable ONLY after the loan is repaid. Returns the new leaf index.
    pub fn unlock(
        env: Env,
        proof: Groth16Proof,
        nullifier: U256,
        commitment: U256,
        root_pool: U256,
        root_repaid: U256,
    ) -> u32 {
        for v in [&nullifier, &commitment, &root_pool, &root_repaid] {
            Self::require_canonical(&env, v);
        }
        // Public signals in snarkjs order: [nullifierOut, commitmentOut, rootPool, rootRepaid].
        let mut pi: Vec<Bn254Fr> = Vec::new(&env);
        pi.push_back(Self::fr(&env, &nullifier));
        pi.push_back(Self::fr(&env, &commitment));
        pi.push_back(Self::fr(&env, &root_pool));
        pi.push_back(Self::fr(&env, &root_repaid));
        Self::verify(&env, ConfigKey::UnlockVerifier, &proof, &pi);

        assert!(Self::known_root(&env, &root_pool), "unknown pool root");
        assert!(root_repaid == Self::vault(&env).repaid_root(), "unknown/stale repaid root");
        assert!(NullifierSet::try_spend(&env, &nullifier), "nullifier already spent");
        Self::insert_spend(&env, nullifier, commitment)
    }

    /// SEIZE joinsplit: spend a LOCKED note GATED on liquidation (`root_liquidated` must equal the
    /// vault's current liquidated-root) and split it into a liquidator note worth the public `seized`
    /// floor + a change note for the hidden surplus (`seized + change == amount`, enforced
    /// in-circuit). Returns the (liquidator, change) leaf indices.
    #[allow(clippy::too_many_arguments)]
    pub fn seize(
        env: Env,
        proof: Groth16Proof,
        nullifier: U256,
        commitment_liquidator: U256,
        commitment_change: U256,
        root_pool: U256,
        root_liquidated: U256,
        seized: U256,
    ) -> (u32, u32) {
        for v in [&nullifier, &commitment_liquidator, &commitment_change, &root_pool, &root_liquidated, &seized] {
            Self::require_canonical(&env, v);
        }
        // Public signals: [nullifierOut, commitmentLiquidator, commitmentChange, rootPool, rootLiquidated, seized].
        let mut pi: Vec<Bn254Fr> = Vec::new(&env);
        pi.push_back(Self::fr(&env, &nullifier));
        pi.push_back(Self::fr(&env, &commitment_liquidator));
        pi.push_back(Self::fr(&env, &commitment_change));
        pi.push_back(Self::fr(&env, &root_pool));
        pi.push_back(Self::fr(&env, &root_liquidated));
        pi.push_back(Self::fr(&env, &seized));
        Self::verify(&env, ConfigKey::SeizeVerifier, &proof, &pi);

        assert!(Self::known_root(&env, &root_pool), "unknown pool root");
        assert!(root_liquidated == Self::vault(&env).liquidated_root(), "unknown/stale liquidated root");
        assert!(NullifierSet::try_spend(&env, &nullifier), "nullifier already spent");
        // Insert the liquidator + change leaves as two sequential single inserts (index-agnostic;
        // insert_two_leaves would require an even next_index). They land at i1 and i1 + 1.
        let i1 = MerkleTreeWithHistory::insert_leaf(&env, commitment_liquidator.clone()).expect("insert");
        let i2 = MerkleTreeWithHistory::insert_leaf(&env, commitment_change).expect("insert");
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
        Spent { nullifier, index: i1, commitment: commitment_liquidator }.publish(&env);
        (i1, i2)
    }

    // ---- internals ----
    /// Verify `pi` against the deployed verifier at `key`; TRAPS on an invalid proof (fail-closed).
    fn verify(env: &Env, key: ConfigKey, proof: &Groth16Proof, pi: &Vec<Bn254Fr>) {
        let addr: Address = env.storage().instance().get(&key).expect("verifier not set");
        assert!(VerifierClient::new(env, &addr).verify(proof, pi), "proof rejected");
    }
    fn vault<'a>(env: &Env) -> VaultClient<'a> {
        let addr: Address = env.storage().instance().get(&ConfigKey::Vault).expect("vault not set");
        VaultClient::new(env, &addr)
    }
    fn known_root(env: &Env, root: &U256) -> bool {
        MerkleTreeWithHistory::is_known_root(env, root).expect("is_known_root")
    }
    /// Insert a spend's minted leaf, bump TTL, emit `Spent`. Returns the leaf index.
    fn insert_spend(env: &Env, nullifier: U256, commitment: U256) -> u32 {
        let index = MerkleTreeWithHistory::insert_leaf(env, commitment.clone()).expect("insert");
        env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
        Spent { nullifier, index, commitment }.publish(env);
        index
    }
    fn fr(env: &Env, v: &U256) -> Bn254Fr {
        let _ = env;
        let b: BytesN<32> = v.to_be_bytes().try_into().expect("U256 is 32 bytes");
        Bn254Fr::from_bytes(b)
    }
    /// Reject a non-canonical field element (`v >= r`). Mandatory on the nullifier (its single-spend
    /// key must be 1:1 with the reduced field element the verifier sees) and applied to every field
    /// input so no non-canonical value reaches the nullifier set, the tree, or a root check. Audit C-01.
    fn require_canonical(env: &Env, v: &U256) {
        let r = U256::from_be_bytes(env, &Bytes::from_array(env, &BN254_R));
        assert!(v < &r, "field element not canonical");
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

/// Recording stub for a deployed joinsplit verifier: accepts any proof, stores the public inputs so
/// tests can assert snarkjs order. The real Groth16 verify is proven separately (Phase 3 / 6a).
#[cfg(test)]
#[contract]
pub struct StubVerifier;
#[cfg(test)]
#[contractimpl]
impl StubVerifier {
    pub fn verify(
        env: Env,
        proof: Groth16Proof,
        public_inputs: Vec<Bn254Fr>,
    ) -> Result<bool, Groth16Error> {
        let _ = proof;
        let mut rec: Vec<U256> = Vec::new(&env);
        for fr in public_inputs.iter() {
            rec.push_back(U256::from_be_bytes(
                &env,
                &Bytes::from_array(&env, &fr.to_bytes().to_array()),
            ));
        }
        env.storage().instance().set(&soroban_sdk::symbol_short!("REC"), &rec);
        Ok(true)
    }
    pub fn recorded(env: Env) -> Vec<U256> {
        env.storage().instance().get(&soroban_sdk::symbol_short!("REC")).unwrap()
    }
}

/// Stub veil-vault exposing settable repaid/liquidated gating roots for unlock/seize tests.
#[cfg(test)]
#[contract]
pub struct StubVault;
#[cfg(test)]
#[contractimpl]
impl StubVault {
    pub fn set_roots(env: Env, repaid: U256, liquidated: U256) {
        env.storage().instance().set(&soroban_sdk::symbol_short!("RE"), &repaid);
        env.storage().instance().set(&soroban_sdk::symbol_short!("LI"), &liquidated);
    }
    pub fn repaid_root(env: Env) -> U256 {
        env.storage().instance().get(&soroban_sdk::symbol_short!("RE")).unwrap()
    }
    pub fn liquidated_root(env: Env) -> U256 {
        env.storage().instance().get(&soroban_sdk::symbol_short!("LI")).unwrap()
    }
}

#[cfg(test)]
mod spend_test {
    use crate::{StubVault, StubVerifier, VeilPool, VeilPoolClient};
    use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Address, Bytes, BytesN, Env, U256};
    use veil_verifier::Groth16Proof;

    struct Fx<'a> {
        env: Env,
        pool: VeilPoolClient<'a>,
        verifier: Address,
        vault: Address,
        known_root: U256,
    }

    fn dummy_proof(env: &Env) -> Groth16Proof {
        Groth16Proof {
            a: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
            b: Bn254G2Affine::from_bytes(BytesN::from_array(env, &[0u8; 128])),
            c: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
        }
    }

    fn setup() -> Fx<'static> {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let verifier = env.register(StubVerifier, ());
        let vault = env.register(StubVault, ());
        let id = env.register(
            VeilPool,
            (admin, sac.address(), 16u32, verifier.clone(), verifier.clone(), verifier.clone()),
        );
        let pool = VeilPoolClient::new(&env, &id);
        pool.set_vault(&vault);

        // A deposit establishes a known, non-trivial pool root the spends can prove against.
        let user = Address::generate(&env);
        token::StellarAssetClient::new(&env, &sac.address()).mint(&user, &1_000i128);
        pool.deposit(&user, &1_000i128, &U256::from_u32(&env, 7), &U256::from_u32(&env, 9));
        let known_root = pool.root();
        Fx { env, pool, verifier, vault, known_root }
    }

    #[test]
    fn lock_verifies_spends_nullifier_and_inserts_leaf() {
        let f = setup();
        let nf = U256::from_u32(&f.env, 111);
        let commitment = U256::from_u32(&f.env, 222);
        let lock_id = U256::from_u32(&f.env, 333);

        let idx = f.pool.lock(&dummy_proof(&f.env), &nf, &commitment, &f.known_root, &lock_id);
        assert!(idx >= 1, "LOCKED leaf inserted after the deposit leaf");

        // Verifier saw [nullifierOut, commitmentOut, root, lockId] in snarkjs order.
        let rec = f.env.invoke_contract::<soroban_sdk::Vec<U256>>(
            &f.verifier,
            &soroban_sdk::Symbol::new(&f.env, "recorded"),
            soroban_sdk::vec![&f.env],
        );
        assert_eq!(rec.get(0).unwrap(), nf);
        assert_eq!(rec.get(1).unwrap(), commitment);
        assert_eq!(rec.get(2).unwrap(), f.known_root);
        assert_eq!(rec.get(3).unwrap(), lock_id);
    }

    #[test]
    #[should_panic(expected = "nullifier already spent")]
    fn lock_rejects_double_spend() {
        let f = setup();
        let nf = U256::from_u32(&f.env, 111);
        f.pool.lock(&dummy_proof(&f.env), &nf, &U256::from_u32(&f.env, 1), &f.known_root, &U256::from_u32(&f.env, 2));
        // Same nullifier, fresh commitment → must be rejected.
        f.pool.lock(&dummy_proof(&f.env), &nf, &U256::from_u32(&f.env, 3), &f.known_root, &U256::from_u32(&f.env, 4));
    }

    #[test]
    #[should_panic(expected = "field element not canonical")]
    fn lock_rejects_noncanonical_nullifier_double_spend() {
        // C-01: nf and nf+r are distinct U256 but the SAME BN254 field element, so the identical
        // proof re-verifies. Rejecting non-canonical inputs closes the double-spend.
        let f = setup();
        let nf = U256::from_u32(&f.env, 111);
        f.pool.lock(&dummy_proof(&f.env), &nf, &U256::from_u32(&f.env, 1), &f.known_root, &U256::from_u32(&f.env, 2));
        let r = U256::from_be_bytes(&f.env, &Bytes::from_array(&f.env, &crate::BN254_R));
        let nf_plus_r = nf.add(&r); // non-canonical representative of the same field element
        f.pool.lock(&dummy_proof(&f.env), &nf_plus_r, &U256::from_u32(&f.env, 3), &f.known_root, &U256::from_u32(&f.env, 4));
    }

    #[test]
    #[should_panic(expected = "unknown pool root")]
    fn lock_rejects_unknown_root() {
        let f = setup();
        let bad_root = U256::from_u32(&f.env, 999_999);
        f.pool.lock(&dummy_proof(&f.env), &U256::from_u32(&f.env, 1), &U256::from_u32(&f.env, 2), &bad_root, &U256::from_u32(&f.env, 3));
    }

    #[test]
    fn unlock_gated_on_vault_repaid_root() {
        let f = setup();
        let repaid = U256::from_u32(&f.env, 42);
        let liquidated = U256::from_u32(&f.env, 43);
        f.env.invoke_contract::<()>(
            &f.vault,
            &soroban_sdk::Symbol::new(&f.env, "set_roots"),
            soroban_sdk::vec![&f.env, repaid.clone().into_val(&f.env), liquidated.into_val(&f.env)],
        );
        let idx = f.pool.unlock(&dummy_proof(&f.env), &U256::from_u32(&f.env, 5), &U256::from_u32(&f.env, 6), &f.known_root, &repaid);
        assert!(idx >= 1, "recovered AVAILABLE note inserted");
    }

    #[test]
    #[should_panic(expected = "unknown/stale repaid root")]
    fn unlock_rejects_wrong_repaid_root() {
        let f = setup();
        f.env.invoke_contract::<()>(
            &f.vault,
            &soroban_sdk::Symbol::new(&f.env, "set_roots"),
            soroban_sdk::vec![&f.env, U256::from_u32(&f.env, 42).into_val(&f.env), U256::from_u32(&f.env, 43).into_val(&f.env)],
        );
        // root_repaid != vault.repaid_root() → rejected (collateral not recoverable without repay).
        f.pool.unlock(&dummy_proof(&f.env), &U256::from_u32(&f.env, 5), &U256::from_u32(&f.env, 6), &f.known_root, &U256::from_u32(&f.env, 99));
    }

    #[test]
    fn seize_gated_on_liquidated_root_and_splits_two_leaves() {
        let f = setup();
        let repaid = U256::from_u32(&f.env, 42);
        let liquidated = U256::from_u32(&f.env, 43);
        f.env.invoke_contract::<()>(
            &f.vault,
            &soroban_sdk::Symbol::new(&f.env, "set_roots"),
            soroban_sdk::vec![&f.env, repaid.into_val(&f.env), liquidated.clone().into_val(&f.env)],
        );
        let (i1, i2) = f.pool.seize(
            &dummy_proof(&f.env),
            &U256::from_u32(&f.env, 7),
            &U256::from_u32(&f.env, 8),  // liquidator commitment
            &U256::from_u32(&f.env, 9),  // change commitment
            &f.known_root,
            &liquidated,
            &U256::from_u32(&f.env, 500), // seized floor
        );
        assert_eq!(i2, i1 + 1, "liquidator + change leaves are sequential");
    }

    #[test]
    #[should_panic(expected = "vault already set")]
    fn set_vault_is_one_time() {
        let f = setup();
        f.pool.set_vault(&Address::generate(&f.env)); // second call rejected
    }

    use soroban_sdk::IntoVal;
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
mod domain_hash_test {
    // Cross-impl vectors for the single-input domain hashes (position_id, lock_handle, repaid_leaf,
    // liquidated_leaf) — the Poseidon2 port of v2's SHA256(TAG ‖ x) family. lock_handle / repaid_leaf
    // / liquidated_leaf are LOAD-BEARING across impls: the Phase-4 vault inserts repaid_leaf /
    // liquidated_leaf on-chain and the unlock/seize circuits prove their membership, so a divergence
    // silently breaks those flows. circom `DomainHash1` (compile `circom/domain_hash_test.circom`),
    // locked in circom/README.md.
    use crate::notes::{lock_handle, liquidated_leaf, position_id, repaid_leaf, spend_pk_from_nk};
    use soroban_sdk::{Bytes, Env, U256};

    fn be(env: &Env, h: [u8; 32]) -> U256 {
        U256::from_be_bytes(env, &Bytes::from_array(env, &h))
    }

    #[test]
    fn spend_pk_from_nk_matches_circom_vector() {
        // The nk→spendPk binding that closes audit C-01 (a note commits spendPk = H1(nk, DS_NK), and
        // the spend circuits constrain it, so one note determines exactly one nullifier). Soroban
        // `spend_pk_from_nk(5)` must byte-match circom DomainHash1(5, 0x34) — the spend circuits'
        // `nkBind.out === spendPk` uses this exact derivation.
        let env = Env::default();
        assert_eq!(
            spend_pk_from_nk(&env, &U256::from_u32(&env, 5)),
            be(&env, [
                0x06, 0x8b, 0x44, 0xd9, 0xb0, 0x58, 0x57, 0xa1, 0xa8, 0x42, 0x7e, 0x25, 0x06, 0x86,
                0x86, 0xa0, 0x01, 0xed, 0x9b, 0x8d, 0xa5, 0x0f, 0xe9, 0x1e, 0x97, 0xfd, 0x70, 0x2d,
                0x59, 0x9b, 0xa0, 0xb2,
            ]),
            "spend_pk_from_nk must match circom DomainHash1(nk, DS_NK)"
        );
    }

    #[test]
    fn domain_hashes_match_circom_vectors() {
        let env = Env::default();
        // lock_handle(lock_id=3) with DS_LOCK=0x31.
        let lh = lock_handle(&env, &U256::from_u32(&env, 3));
        assert_eq!(
            lh,
            be(&env, [
                0x0d, 0xef, 0xe1, 0x57, 0x5c, 0xc9, 0x9d, 0xd3, 0x89, 0xe7, 0x3b, 0x0c, 0x93, 0xe8,
                0x87, 0xb1, 0x8e, 0xb6, 0xe0, 0x5f, 0x09, 0x5e, 0x42, 0x8d, 0xe3, 0x5f, 0x97, 0x26,
                0xd9, 0xce, 0x25, 0xea,
            ]),
            "lock_handle must match circom DomainHash1(3, 0x31)"
        );
        // position_id(loan_secret=4) with DS_POS=0x30.
        assert_eq!(
            position_id(&env, &U256::from_u32(&env, 4)),
            be(&env, [
                0x0f, 0x34, 0xe4, 0x06, 0xa3, 0xfc, 0x13, 0x98, 0x01, 0x5e, 0x5f, 0x23, 0xce, 0x5e,
                0x00, 0x21, 0x97, 0xda, 0x68, 0x9a, 0xfa, 0x2a, 0xa9, 0x29, 0x3c, 0x3e, 0x4e, 0xd2,
                0x2e, 0x82, 0xe0, 0x66,
            ]),
            "position_id must match circom DomainHash1(4, 0x30)"
        );
        // repaid_leaf(lock_handle) with DS_REPAID=0x32.
        assert_eq!(
            repaid_leaf(&env, &lh),
            be(&env, [
                0x23, 0x2c, 0xe7, 0x52, 0x79, 0x4c, 0xe1, 0x4f, 0x43, 0x4d, 0x9c, 0x8c, 0xc1, 0x5b,
                0x46, 0xee, 0x04, 0x87, 0x5f, 0xa7, 0x8d, 0x54, 0x1c, 0x09, 0xf4, 0x91, 0x71, 0xf4,
                0x25, 0x3a, 0x1d, 0x32,
            ]),
            "repaid_leaf must match circom DomainHash1(lh, 0x32)"
        );
        // liquidated_leaf(lock_handle) with DS_LIQUIDATED=0x33.
        assert_eq!(
            liquidated_leaf(&env, &lh),
            be(&env, [
                0x2e, 0x72, 0x22, 0x2b, 0xf6, 0xfa, 0x84, 0xce, 0xb1, 0xa1, 0x31, 0x01, 0x2c, 0x75,
                0x08, 0xcf, 0x92, 0x92, 0xbc, 0xb9, 0x19, 0xcf, 0x3e, 0xb5, 0x90, 0xb7, 0x26, 0x48,
                0x6c, 0xb9, 0xeb, 0xdc,
            ]),
            "liquidated_leaf must match circom DomainHash1(lh, 0x33)"
        );
    }

    #[test]
    fn domain_roles_are_separated() {
        // repaid and liquidated leaves of the same lock_handle must never collide (a repaid
        // position must not look liquidated, and vice versa) — v2's REPAID/LIQUIDATED tag split.
        let env = Env::default();
        let lh = lock_handle(&env, &U256::from_u32(&env, 7));
        assert!(repaid_leaf(&env, &lh) != liquidated_leaf(&env, &lh), "repaid ≠ liquidated");
        // deterministic: the same lock_id always yields the same handle.
        assert_eq!(lh, lock_handle(&env, &U256::from_u32(&env, 7)), "lock_handle deterministic");
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

        let id = env.register(VeilPool, (Address::generate(&env), sac.address(), 16u32, Address::generate(&env), Address::generate(&env), Address::generate(&env)));
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
        let id = env.register(VeilPool, (Address::generate(&env), sac.address(), 16u32, Address::generate(&env), Address::generate(&env), Address::generate(&env)));
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
        let id = env.register(VeilPool, (Address::generate(&env), sac.address(), 16u32, Address::generate(&env), Address::generate(&env), Address::generate(&env)));
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
        let id = env.register(VeilPool, (Address::generate(&env), sac.address(), 16u32, Address::generate(&env), Address::generate(&env), Address::generate(&env)));
        let pool = VeilPoolClient::new(&env, &id);

        let too_big = U256::from_be_bytes(&env, &soroban_sdk::Bytes::from_array(&env, &[0xFFu8; 32]));
        pool.deposit(&user, &500i128, &too_big, &U256::from_u32(&env, 1));
    }
}

#[cfg(test)]
mod attest_test {
    use crate::merkle_with_history::MerkleTreeWithHistory as T;
    use crate::{TestHost, VeilPool, VeilPoolClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env, U256};

    fn new_pool(env: &Env) -> VeilPoolClient<'static> {
        let sac = env.register_stellar_asset_contract_v2(Address::generate(env));
        let id = env.register(
            VeilPool,
            (
                Address::generate(env),
                sac.address(),
                16u32,
                Address::generate(env),
                Address::generate(env),
                Address::generate(env),
            ),
        );
        VeilPoolClient::new(env, &id)
    }

    #[test]
    fn attest_lock_inserts_backs_and_is_provable() {
        let env = Env::default();
        env.mock_all_auths();
        let pool = new_pool(&env);
        pool.set_relayer(&Address::generate(&env));

        let c = U256::from_u32(&env, 12345);
        let amount = 2_000_000_000_000_000i128;
        let idx = pool.attest_lock(&c, &amount);

        assert_eq!(idx, 0, "first attested leaf at index 0");
        assert_eq!(pool.total_deposited(), amount, "amount recorded as backing");

        // The attested commitment IS the leaf: a fresh tree with just `c` reaches the same root, so
        // the existing lock/borrow membership circuits can prove it (no Stellar escrow required).
        let root = pool.root();
        assert!(pool.is_known_root(&root));
        let id2 = env.register(TestHost, ());
        env.as_contract(&id2, || T::init(&env, 16).unwrap());
        env.as_contract(&id2, || T::insert_leaf(&env, c.clone()).unwrap());
        let expected = env.as_contract(&id2, || T::get_last_root(&env).unwrap());
        assert_eq!(root, expected, "attested leaf is the note commitment");
    }

    #[test]
    #[should_panic(expected = "commitment already attested")]
    fn attest_lock_rejects_double_attest() {
        // One Ethereum lock → one note. Re-attesting the same commitment would mint a second
        // borrowable note (distinct nullifier per leaf index) backed by one lock → double-borrow.
        let env = Env::default();
        env.mock_all_auths();
        let pool = new_pool(&env);
        pool.set_relayer(&Address::generate(&env));
        let c = U256::from_u32(&env, 12345);
        pool.attest_lock(&c, &1_000i128);
        pool.attest_lock(&c, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "relayer not set")]
    fn attest_lock_requires_relayer_configured() {
        let env = Env::default();
        env.mock_all_auths();
        let pool = new_pool(&env);
        pool.attest_lock(&U256::from_u32(&env, 1), &1_000i128);
    }

    #[test]
    #[should_panic(expected = "relayer already set")]
    fn set_relayer_is_one_time() {
        let env = Env::default();
        env.mock_all_auths();
        let pool = new_pool(&env);
        pool.set_relayer(&Address::generate(&env));
        pool.set_relayer(&Address::generate(&env));
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn attest_lock_rejects_nonpositive_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let pool = new_pool(&env);
        pool.set_relayer(&Address::generate(&env));
        pool.attest_lock(&U256::from_u32(&env, 1), &0i128);
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
