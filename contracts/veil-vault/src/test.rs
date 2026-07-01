//! Unit 1 — LP + interest skeleton. Exercises the ERC-4626 deposit/withdraw + share accounting that
//! Phase 4 reuses verbatim from vault-v2 (the Groth16 borrow/margin path + Poseidon gating trees land
//! in later units). The proof-dependent paths are not yet present, so accrue is a no-op here
//! (borrow_index only moves once there is outstanding borrowed principal).
#![cfg(test)]

use crate::{Asset, VeilVault, VeilVaultClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Address, Env, Symbol};

struct Fx<'a> {
    env: Env,
    vault: VeilVaultClient<'a>,
    usdc: token::TokenClient<'a>,
    lp: Address,
}

fn setup() -> Fx<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let lp = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let usdc = token::TokenClient::new(&env, &sac.address());
    token::StellarAssetClient::new(&env, &sac.address()).mint(&lp, &10_000_000i128);

    // borrow_verifier / veil_pool / reflector are unused by the LP paths — dummy addresses.
    let id = env.register(
        VeilVault,
        (
            Address::generate(&env),          // admin
            Address::generate(&env),          // borrow_verifier
            Address::generate(&env),          // veil_pool
            sac.address(),                    // usdc
            Address::generate(&env),          // reflector
            Asset::Other(Symbol::new(&env, "WSTETH")),
            7000u32,                          // ltv_bps
            8000u32,                          // liq_bps
            1_000u128,                        // min_threshold
            100_000u32,                       // term_ledgers
            500u32,                           // rate_bps
        ),
    );
    let vault = VeilVaultClient::new(&env, &id);
    Fx { env, vault, usdc, lp }
}

#[test]
fn first_deposit_mints_shares_one_to_one_and_escrows_usdc() {
    let f = setup();
    let vault_addr = f.vault.address.clone();

    let shares = f.vault.lp_deposit(&f.lp, &1_000_000i128);
    assert_eq!(shares, 1_000_000, "first deposit mints shares 1:1");
    assert_eq!(f.usdc.balance(&f.lp), 9_000_000, "USDC left the LP");
    assert_eq!(f.usdc.balance(&vault_addr), 1_000_000, "USDC escrowed in the vault");
    assert_eq!(f.vault.shares_of(&f.lp), 1_000_000);
    assert_eq!(f.vault.total_assets(), 1_000_000);
}

#[test]
fn withdraw_returns_assets_and_burns_shares() {
    let f = setup();
    f.vault.lp_deposit(&f.lp, &1_000_000i128);

    let assets = f.vault.lp_withdraw(&f.lp, &400_000i128);
    assert_eq!(assets, 400_000, "no interest yet → shares redeem 1:1");
    assert_eq!(f.vault.shares_of(&f.lp), 600_000);
    assert_eq!(f.usdc.balance(&f.lp), 9_400_000);
    assert_eq!(f.vault.total_assets(), 600_000);
}

#[test]
fn second_depositor_shares_track_pool_value() {
    // With no interest, a second depositor gets shares proportional to assets (still 1:1 here).
    let f = setup();
    f.vault.lp_deposit(&f.lp, &1_000_000i128);

    let lp2 = Address::generate(&f.env);
    token::StellarAssetClient::new(&f.env, &f.usdc.address).mint(&lp2, &500_000i128);
    let shares2 = f.vault.lp_deposit(&lp2, &500_000i128);
    assert_eq!(shares2, 500_000);
    assert_eq!(f.vault.total_assets(), 1_500_000);
}

#[test]
fn deposit_rejects_zero_amount() {
    let f = setup();
    let r = f.vault.try_lp_deposit(&f.lp, &0i128);
    assert!(r.is_err(), "zero deposit must be rejected");
}

#[test]
fn withdraw_rejects_more_shares_than_held() {
    let f = setup();
    f.vault.lp_deposit(&f.lp, &1_000i128);
    let r = f.vault.try_lp_withdraw(&f.lp, &2_000i128);
    assert!(r.is_err(), "over-withdraw must be rejected");
}

// ---- Poseidon gating trees (unit 2) ----

mod gating_tree {
    use crate::tree;
    use soroban_sdk::{Bytes, Env, U256};
    use veil_pool::notes::lock_handle;

    fn be(env: &Env, h: [u8; 32]) -> U256 {
        U256::from_be_bytes(env, &Bytes::from_array(env, &h))
    }

    #[test]
    fn repaid_tree_root_matches_circom_merkleproof_vector() {
        // The vault's Poseidon repaid-tree root after appending repaid_leaf(lock_handle(3)) must
        // equal circom MerkleProof(16) for that leaf at index 0 (rootRepaid, locked in Phase 2's
        // unlock cross-vector). If they diverge, an unlock proof's rootRepaid never matches the
        // vault's published R_sor and collateral can never be recovered.
        let env = Env::default();
        let lh = lock_handle(&env, &U256::from_u32(&env, 3));
        let leaf = tree::repaid_leaf(&env, &lh);

        let mut t = tree::empty(&env);
        tree::insert(&env, &mut t, leaf);

        let expected = be(&env, [
            0x1c, 0x49, 0xf8, 0xba, 0xee, 0xac, 0xd1, 0x48, 0x98, 0xcf, 0x4e, 0x5b, 0x2c, 0x06,
            0x72, 0x38, 0xdf, 0xbb, 0x13, 0x84, 0x5e, 0xab, 0xcf, 0x0f, 0xf1, 0xc8, 0x9c, 0x3a,
            0xa0, 0x70, 0x77, 0xa9,
        ]);
        assert_eq!(t.root, expected, "repaid-tree root must match circom MerkleProof(rootRepaid)");
        assert_eq!(t.next_index, 1);
    }

    #[test]
    fn liquidated_tree_root_matches_circom_merkleproof_vector() {
        // Same lock for the liquidated-tree (seize circuit's rootLiquidated). repaid and liquidated
        // leaves differ only by DS (0x32 vs 0x33), so the two roots must also differ.
        let env = Env::default();
        let lh = lock_handle(&env, &U256::from_u32(&env, 3));
        let leaf = tree::liquidated_leaf(&env, &lh);

        let mut t = tree::empty(&env);
        tree::insert(&env, &mut t, leaf);

        let expected = be(&env, [
            0x06, 0xf8, 0x23, 0x19, 0x53, 0x2b, 0xd7, 0x10, 0x1e, 0xd8, 0x1c, 0x14, 0x26, 0x41,
            0xa8, 0xc2, 0x97, 0xc1, 0x10, 0xfc, 0x26, 0x0a, 0xd1, 0x26, 0x92, 0x3a, 0x18, 0xf8,
            0x6a, 0x05, 0x48, 0xab,
        ]);
        assert_eq!(t.root, expected, "liquidated-tree root must match circom (rootLiquidated)");
    }
}

#[test]
fn constructor_seeds_empty_gating_trees() {
    let f = setup();
    // Empty trees: count 0, and repaid ≠ liquidated only after inserts — but both empty roots equal
    // get_zeroes[16]. Here we just assert the views are wired and start empty.
    assert_eq!(f.vault.repaid_count(), 0);
    assert_eq!(f.vault.liquidated_count(), 0);
    assert_eq!(f.vault.repaid_root(), f.vault.liquidated_root(), "empty trees share the zero root");
}

// ---- borrow (unit 3): cross-contract verifier + veil-pool root ----
//
// The vault's borrow LOGIC is tested with a recording STUB verifier (returns Ok(true), captures the
// public inputs) + a stub pool (configurable known root) + a mock oracle. The REAL Groth16 proof
// verification is proven separately in Phase 3's on-chain cross-check; here we prove the vault builds
// the right public-input vector (snarkjs order + borrower binding), gates on the pool root, and does
// the lending accounting correctly.
mod borrow {
    use crate::{Asset, PriceData, VeilVault, VeilVaultClient};
    use soroban_sdk::crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{
        contract, contractimpl, symbol_short, token, Address, Bytes, BytesN, Env, Symbol, Vec, U256,
    };
    use veil_verifier::{Groth16Error, Groth16Proof};

    // Recording stub for the deployed borrow verifier: accepts any proof, stores the public inputs.
    #[contract]
    pub struct StubVerifier;
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
            env.storage().instance().set(&symbol_short!("REC"), &rec);
            Ok(true)
        }
        pub fn recorded(env: Env) -> Vec<U256> {
            env.storage().instance().get(&symbol_short!("REC")).unwrap()
        }
    }

    // Stub veil-pool: one configurable known root.
    #[contract]
    pub struct StubPool;
    #[contractimpl]
    impl StubPool {
        pub fn set_known(env: Env, root: U256) {
            env.storage().instance().set(&symbol_short!("K"), &root);
        }
        pub fn is_known_root(env: Env, root: U256) -> bool {
            env.storage()
                .instance()
                .get::<Symbol, U256>(&symbol_short!("K"))
                .map(|k| k == root)
                .unwrap_or(false)
        }
    }

    // Mock Reflector oracle: fixed fresh price, 8 decimals.
    #[contract]
    pub struct MockReflector;
    #[contractimpl]
    impl MockReflector {
        pub fn lastprice(env: Env, _asset: Asset) -> Option<PriceData> {
            Some(PriceData { price: 200_000_000_000i128, timestamp: env.ledger().timestamp() })
        }
        pub fn decimals(_env: Env) -> u32 {
            8
        }
    }

    struct Bx<'a> {
        env: Env,
        vault: VeilVaultClient<'a>,
        usdc: token::TokenClient<'a>,
        verifier_id: Address,
        borrower: Address,
        root: U256,
    }

    fn dummy_proof(env: &Env) -> Groth16Proof {
        Groth16Proof {
            a: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
            b: Bn254G2Affine::from_bytes(BytesN::from_array(env, &[0u8; 128])),
            c: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
        }
    }

    fn setup_borrow() -> Bx<'static> {
        let env = Env::default();
        env.mock_all_auths();

        let issuer = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let usdc = token::TokenClient::new(&env, &sac.address());
        let usdc_admin = token::StellarAssetClient::new(&env, &sac.address());

        let verifier_id = env.register(StubVerifier, ());
        let pool_id = env.register(StubPool, ());
        let reflector_id = env.register(MockReflector, ());

        let root = U256::from_u32(&env, 777);
        env.invoke_contract::<()>(
            &pool_id,
            &Symbol::new(&env, "set_known"),
            soroban_sdk::vec![&env, root.clone().into_val(&env)],
        );

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);
        let id = env.register(
            VeilVault,
            (
                admin,
                verifier_id.clone(),
                pool_id.clone(),
                sac.address(),
                reflector_id,
                Asset::Other(Symbol::new(&env, "WSTETH")),
                7000u32,       // ltv_bps
                8000u32,       // liq_bps
                1_000u128,     // min_threshold
                100_000u32,    // term_ledgers
                500u32,        // rate_bps
            ),
        );
        let vault = VeilVaultClient::new(&env, &id);

        // Fund the LP so there is idle liquidity to lend, and mint nothing to the borrower yet.
        let lp = Address::generate(&env);
        usdc_admin.mint(&lp, &100_000_000_000i128);
        vault.lp_deposit(&lp, &100_000_000_000i128);

        let _ = pool_id;
        Bx { env, vault, usdc, verifier_id, borrower, root }
    }

    use soroban_sdk::IntoVal;

    #[test]
    fn borrow_verifies_gates_on_root_and_disburses() {
        let b = setup_borrow();
        let pid = U256::from_u32(&b.env, 111);
        let lh = U256::from_u32(&b.env, 222);
        let threshold = 1_000_000_000_000_000_000u128; // 1e18

        let principal = b.vault.borrow(
            &dummy_proof(&b.env),
            &pid,
            &lh,
            &b.root,
            &threshold,
            &b.borrower,
        );
        assert!(principal > 0, "principal disbursed");
        assert_eq!(b.usdc.balance(&b.borrower), principal, "borrower received USDC");

        // Position recorded + lock consumed.
        let pos = b.vault.get_position(&pid).unwrap();
        assert_eq!(pos.floor, threshold);
        assert_eq!(pos.principal, principal);
        assert!(b.vault.is_lock_used(&lh));

        // The verifier received public inputs in SNARKJS order: [pid, lh, root, threshold, borrower].
        let rec = b.env.invoke_contract::<Vec<U256>>(
            &b.verifier_id,
            &Symbol::new(&b.env, "recorded"),
            soroban_sdk::vec![&b.env],
        );
        assert_eq!(rec.get(0).unwrap(), pid, "pi[0]=positionId");
        assert_eq!(rec.get(1).unwrap(), lh, "pi[1]=lockHandle");
        assert_eq!(rec.get(2).unwrap(), b.root, "pi[2]=root");
        assert_eq!(rec.get(3).unwrap(), U256::from_u128(&b.env, threshold), "pi[3]=threshold");
        // pi[4] is the invoker-bound borrower field (non-zero, < r).
        assert!(rec.get(4).unwrap() != U256::from_u32(&b.env, 0), "pi[4]=borrower field bound");
    }

    #[test]
    fn borrow_rejects_unknown_root() {
        let b = setup_borrow();
        let r = b.vault.try_borrow(
            &dummy_proof(&b.env),
            &U256::from_u32(&b.env, 111),
            &U256::from_u32(&b.env, 222),
            &U256::from_u32(&b.env, 999), // not the configured known root
            &1_000_000_000_000_000_000u128,
            &b.borrower,
        );
        assert!(r.is_err(), "unknown root must be rejected");
    }

    #[test]
    fn borrow_rejects_below_min_threshold() {
        let b = setup_borrow();
        let r = b.vault.try_borrow(
            &dummy_proof(&b.env),
            &U256::from_u32(&b.env, 111),
            &U256::from_u32(&b.env, 222),
            &b.root,
            &500u128, // < min_threshold 1_000
            &b.borrower,
        );
        assert!(r.is_err(), "below-min threshold must be rejected");
    }

    #[test]
    fn borrow_rejects_reused_lock() {
        let b = setup_borrow();
        let lh = U256::from_u32(&b.env, 222);
        let t = 1_000_000_000_000_000_000u128;
        b.vault.borrow(&dummy_proof(&b.env), &U256::from_u32(&b.env, 111), &lh, &b.root, &t, &b.borrower);
        // Same lock, different position id → LockHandleUsed.
        let r = b.vault.try_borrow(
            &dummy_proof(&b.env),
            &U256::from_u32(&b.env, 333),
            &lh,
            &b.root,
            &t,
            &b.borrower,
        );
        assert!(r.is_err(), "a reused lock handle must be rejected");
    }

    // ---- margin / repay / liquidate (unit 4) ----
    use soroban_sdk::testutils::Ledger as _;

    const T: u128 = 1_000_000_000_000_000_000; // 1e18 threshold

    // Open a position and return (position_id, lock_handle, principal).
    fn open(b: &Bx) -> (U256, U256, i128) {
        let pid = U256::from_u32(&b.env, 111);
        let lh = U256::from_u32(&b.env, 222);
        let principal = b.vault.borrow(&dummy_proof(&b.env), &pid, &lh, &b.root, &T, &b.borrower);
        (pid, lh, principal)
    }

    #[test]
    fn repay_settles_debt_and_appends_repaid_leaf() {
        let b = setup_borrow();
        let (pid, _lh, principal) = open(&b);
        assert_eq!(b.vault.repaid_count(), 0);

        // Same ledger → no interest → debt == principal; the borrower holds exactly that.
        let repaid = b.vault.repay(&pid);
        assert_eq!(repaid, principal, "debt with no accrual equals principal");
        assert_eq!(b.usdc.balance(&b.borrower), 0, "borrower paid the debt back");
        assert_eq!(b.vault.get_position(&pid).unwrap().status, crate::STATUS_REPAID);
        // The Poseidon repaid-leaf was appended → the unlock circuit can now prove membership.
        assert_eq!(b.vault.repaid_count(), 1, "repaid_leaf appended");
        assert_ne!(b.vault.repaid_root(), b.vault.liquidated_root(), "repaid root advanced");
    }

    #[test]
    fn repay_rejects_a_closed_position() {
        let b = setup_borrow();
        let (pid, _lh, _p) = open(&b);
        b.vault.repay(&pid);
        assert!(b.vault.try_repay(&pid).is_err(), "double repay must be rejected");
    }

    #[test]
    fn margin_raises_floor_with_higher_threshold() {
        let b = setup_borrow();
        let (pid, lh, _p) = open(&b);
        assert_eq!(b.vault.get_position(&pid).unwrap().floor, T);

        let higher = T + 500_000_000_000_000_000; // 1.5e18
        let new_floor = b.vault.margin(&dummy_proof(&b.env), &pid, &lh, &b.root, &higher, &b.borrower);
        assert_eq!(new_floor, higher);
        assert_eq!(b.vault.get_position(&pid).unwrap().floor, higher, "floor tightened");
    }

    #[test]
    fn margin_rejects_non_raising_threshold() {
        let b = setup_borrow();
        let (pid, lh, _p) = open(&b);
        // Equal or lower threshold must not weaken the proven lower bound.
        let r = b.vault.try_margin(&dummy_proof(&b.env), &pid, &lh, &b.root, &T, &b.borrower);
        assert!(r.is_err(), "a non-raising margin must be rejected");
    }

    #[test]
    fn margin_rejects_lock_mismatch() {
        let b = setup_borrow();
        let (pid, _lh, _p) = open(&b);
        let other_lock = U256::from_u32(&b.env, 999);
        let higher = T + 1;
        let r = b.vault.try_margin(&dummy_proof(&b.env), &pid, &other_lock, &b.root, &higher, &b.borrower);
        assert!(r.is_err(), "margin can't swap the locked collateral");
    }

    #[test]
    fn liquidate_past_due_appends_liquidated_leaf() {
        let b = setup_borrow();
        let (pid, _lh, principal) = open(&b);

        // Advance past the loan term → past-due liquidation (no oracle needed).
        b.env.ledger().with_mut(|l| l.sequence_number += 100_001);
        assert!(b.vault.is_liquidatable(&pid), "past-due position is liquidatable");

        let liquidator = Address::generate(&b.env);
        let debt = b.vault.debt_of(&pid);
        token::StellarAssetClient::new(&b.env, &b.usdc.address).mint(&liquidator, &(principal * 2));

        let absorbed = b.vault.liquidate(&pid, &liquidator);
        assert_eq!(absorbed, debt, "liquidator repaid the full debt");
        assert_eq!(b.vault.get_position(&pid).unwrap().status, crate::STATUS_LIQUIDATED);
        assert_eq!(b.vault.liquidated_count(), 1, "liquidated_leaf appended");
    }

    #[test]
    fn liquidate_rejects_a_healthy_position() {
        let b = setup_borrow();
        let (pid, _lh, _p) = open(&b);
        let liquidator = Address::generate(&b.env);
        // Fresh, over-collateralized, not past due → NotLiquidatable.
        assert!(!b.vault.is_liquidatable(&pid));
        assert!(b.vault.try_liquidate(&pid, &liquidator).is_err(), "healthy position must not liquidate");
    }
}
