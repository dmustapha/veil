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
