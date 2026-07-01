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
