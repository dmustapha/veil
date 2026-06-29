#![cfg(test)]
extern crate std;

use crate::{Asset, Error, PriceData, VeilVault, VeilVaultClient};
use risc0_interface::VerifierError;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Bytes, BytesN, Env};

// ---- inline mocks ----

/// Accepts iff the seal equals the journal digest (binds proof <-> journal, so a tampered
/// journal fails verification — mirrors the real cryptographic binding).
#[contract]
struct MockVerifier;
#[contractimpl]
impl MockVerifier {
    pub fn verify(
        env: Env,
        seal: Bytes,
        _image_id: BytesN<32>,
        journal: BytesN<32>,
    ) -> Result<(), VerifierError> {
        let expected = Bytes::from_array(&env, &journal.to_array());
        if seal == expected {
            Ok(())
        } else {
            Err(VerifierError::InvalidProof)
        }
    }
}

#[contract]
struct MockReflector;
#[contractimpl]
impl MockReflector {
    pub fn lastprice(_env: Env, _asset: Asset) -> Option<PriceData> {
        Some(PriceData { price: 150_000_000_000_000_000, timestamp: 0 }) // 1500 * 1e14, 14 decimals
    }
    pub fn decimals(_env: Env) -> u32 {
        14
    }
}

struct Fixture<'a> {
    env: Env,
    vault: VeilVaultClient<'a>,
    vault_id: Address,
    usdc: token::TokenClient<'a>,
    admin: Address,
    lp: Address,
    borrower: Address,
}

const UNIT: u128 = 1_000_000_000_000_000_000; // 1.0 wstETH-unit (1e18, same scale as wei)
const LEDGERS_PER_YEAR: u32 = 365 * 17_280;

fn setup(rate_bps: u32) -> Fixture<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let lp = Address::generate(&env);
    let borrower = Address::generate(&env);
    let issuer = Address::generate(&env);

    let vault_id = env.register(VeilVault, ());
    let vault = VeilVaultClient::new(&env, &vault_id);
    let verifier = env.register(MockVerifier, ());
    let reflector = env.register(MockReflector, ());

    let sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let usdc = token::TokenClient::new(&env, &sac.address());
    let usdc_admin = token::StellarAssetClient::new(&env, &sac.address());
    // Fund the LP and the borrower (borrower needs extra to pay interest on repay).
    usdc_admin.mint(&lp, &1_000_000_0000000i128); // 1,000,000 USDC
    usdc_admin.mint(&borrower, &10_000_0000000i128); // 10,000 USDC buffer for interest

    let image_id = BytesN::from_array(&env, &[0x11u8; 32]);

    vault.init(
        &admin,
        &verifier,
        &image_id,
        &sac.address(),
        &reflector,
        &Asset::Other(symbol_short!("ETH")),
        &5_000u32,             // 50% LTV
        &(UNIT / 10),          // min threshold 0.1 unit
        &(17_280u32 * 7),      // 7-day term
        &rate_bps,
    );

    Fixture { env, vault, vault_id, usdc, admin, lp, borrower }
}

fn recipient_of(env: &Env, who: &Address) -> BytesN<32> {
    env.crypto().keccak256(&who.to_string().to_bytes()).to_bytes()
}

// canonical 144-byte v2 borrow journal
fn journal(
    env: &Env,
    root: &BytesN<32>,
    threshold: u128,
    position_id: &BytesN<32>,
    lock_handle: &BytesN<32>,
    who: &Address,
) -> Bytes {
    let mut b = Bytes::new(env);
    b.append(&Bytes::from_array(env, &root.to_array())); // 32
    b.append(&Bytes::from_array(env, &threshold.to_be_bytes())); // 16
    b.append(&Bytes::from_array(env, &position_id.to_array())); // 32
    b.append(&Bytes::from_array(env, &lock_handle.to_array())); // 32
    b.append(&Bytes::from_array(env, &recipient_of(env, who).to_array())); // 32 -> 144
    b
}

fn digest_seal(env: &Env, j: &Bytes) -> Bytes {
    let d = env.crypto().sha256(j);
    Bytes::from_array(env, &d.to_bytes().to_array())
}

fn b32(env: &Env, x: u8) -> BytesN<32> {
    BytesN::from_array(env, &[x; 32])
}

/// LP funds the pool and a fresh root is posted. Returns the root.
fn prime(f: &Fixture, liquidity: i128) -> BytesN<32> {
    let root = b32(&f.env, 0xAB);
    f.vault.add_root(&root);
    f.vault.lp_deposit(&f.lp, &liquidity);
    root
}

#[test]
fn happy_path_borrow() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let lock = b32(&f.env, 0x02);
    let j = journal(&f.env, &root, 2 * UNIT, &pid, &lock, &f.borrower);

    let principal = f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);
    // 2 units * $1500 * 50% = $1500 = 1500.0000000 USDC
    assert_eq!(principal, 15_000_000_000i128);
    assert_eq!(f.usdc.balance(&f.borrower), 10_000_0000000i128 + 15_000_000_000i128);
    assert!(f.vault.is_lock_used(&lock));
    let pos = f.vault.get_position(&pid).unwrap();
    assert_eq!(pos.principal, principal);
    assert_eq!(pos.status, 0);
}

#[test]
fn unknown_root_rejected() {
    let f = setup(0);
    f.vault.lp_deposit(&f.lp, &1_000_000_0000000i128); // liquidity but no root
    let root = b32(&f.env, 0xAB);
    let j = journal(&f.env, &root, 2 * UNIT, &b32(&f.env, 1), &b32(&f.env, 2), &f.borrower);
    assert_eq!(
        f.vault.try_borrow(&digest_seal(&f.env, &j), &j, &f.borrower),
        Err(Ok(Error::UnknownRoot))
    );
}

#[test]
fn wrong_borrower_rejected() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let other = Address::generate(&f.env); // proof bound to someone else
    let j = journal(&f.env, &root, 2 * UNIT, &b32(&f.env, 1), &b32(&f.env, 2), &other);
    assert_eq!(
        f.vault.try_borrow(&digest_seal(&f.env, &j), &j, &f.borrower),
        Err(Ok(Error::WrongBorrower))
    );
    assert_eq!(f.usdc.balance(&f.borrower), 10_000_0000000i128); // untouched
}

#[test]
fn tampered_journal_reverts() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let lock = b32(&f.env, 0x02);
    let j = journal(&f.env, &root, 2 * UNIT, &pid, &lock, &f.borrower);
    let seal = digest_seal(&f.env, &j); // binds the ORIGINAL journal
    // tamper: claim 100 units instead of 2 -> seal no longer matches digest
    let jt = journal(&f.env, &root, 100 * UNIT, &pid, &lock, &f.borrower);
    assert!(f.vault.try_borrow(&seal, &jt, &f.borrower).is_err());
    assert_eq!(f.usdc.balance(&f.borrower), 10_000_0000000i128);
}

#[test]
fn lock_handle_replay_rejected() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let lock = b32(&f.env, 0x02);
    let j1 = journal(&f.env, &root, 2 * UNIT, &b32(&f.env, 0x01), &lock, &f.borrower);
    f.vault.borrow(&digest_seal(&f.env, &j1), &j1, &f.borrower);
    // same lock handle, different position id -> rejected
    let j2 = journal(&f.env, &root, 2 * UNIT, &b32(&f.env, 0x09), &lock, &f.borrower);
    assert_eq!(
        f.vault.try_borrow(&digest_seal(&f.env, &j2), &j2, &f.borrower),
        Err(Ok(Error::LockHandleUsed))
    );
}

#[test]
fn duplicate_position_rejected() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let j1 = journal(&f.env, &root, 2 * UNIT, &pid, &b32(&f.env, 0x02), &f.borrower);
    f.vault.borrow(&digest_seal(&f.env, &j1), &j1, &f.borrower);
    // same position id, different lock handle -> rejected
    let j2 = journal(&f.env, &root, 2 * UNIT, &pid, &b32(&f.env, 0x09), &f.borrower);
    assert_eq!(
        f.vault.try_borrow(&digest_seal(&f.env, &j2), &j2, &f.borrower),
        Err(Ok(Error::PositionExists))
    );
}

#[test]
fn threshold_too_low_rejected() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let j = journal(&f.env, &root, UNIT / 100, &b32(&f.env, 1), &b32(&f.env, 2), &f.borrower); // 0.01 < 0.1 min
    assert_eq!(
        f.vault.try_borrow(&digest_seal(&f.env, &j), &j, &f.borrower),
        Err(Ok(Error::ThresholdTooLow))
    );
}

#[test]
fn insufficient_liquidity_rejected() {
    let f = setup(0);
    let root = prime(&f, 100_0000000i128); // only 100 USDC in the pool
    let j = journal(&f.env, &root, 2 * UNIT, &b32(&f.env, 1), &b32(&f.env, 2), &f.borrower); // wants 1500
    assert_eq!(
        f.vault.try_borrow(&digest_seal(&f.env, &j), &j, &f.borrower),
        Err(Ok(Error::InsufficientLiquidity))
    );
}

#[test]
fn lp_deposit_then_withdraw_round_trips() {
    let f = setup(0);
    f.vault.add_root(&b32(&f.env, 0xAB));
    let shares = f.vault.lp_deposit(&f.lp, &500_0000000i128); // 500 USDC
    assert_eq!(shares, 500_0000000i128); // first deposit: 1 share == 1 asset
    assert_eq!(f.vault.shares_of(&f.lp), shares);
    let out = f.vault.lp_withdraw(&f.lp, &shares);
    assert_eq!(out, 500_0000000i128);
    assert_eq!(f.vault.shares_of(&f.lp), 0);
}

#[test]
fn interest_accrues_and_lps_earn() {
    let f = setup(1_000); // 10%/yr
    let root = prime(&f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let j = journal(&f.env, &root, 2 * UNIT, &pid, &b32(&f.env, 0x02), &f.borrower);
    let principal = f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);

    let assets_before = f.vault.total_assets();

    // advance one year
    f.env.ledger().with_mut(|l| l.sequence_number += LEDGERS_PER_YEAR);

    // debt grew ~10%
    let debt = f.vault.debt_of(&pid);
    let expected = principal + principal / 10;
    // allow tiny rounding
    assert!((debt - expected).abs() <= 2, "debt {} vs expected {}", debt, expected);

    // repay closes the position and returns principal + interest to the pool
    let repaid = f.vault.repay(&pid);
    assert_eq!(repaid, debt);
    assert_eq!(f.vault.get_position(&pid).unwrap().status, 1);

    // LP total assets grew by the interest earned
    let assets_after = f.vault.total_assets();
    assert!(assets_after > assets_before, "LP assets should grow: {} -> {}", assets_before, assets_after);
    assert_eq!(assets_after - assets_before, debt - principal);
}

#[test]
fn repay_twice_rejected() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let j = journal(&f.env, &root, 2 * UNIT, &pid, &b32(&f.env, 0x02), &f.borrower);
    f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);
    f.vault.repay(&pid);
    assert_eq!(f.vault.try_repay(&pid), Err(Ok(Error::AlreadyClosed)));
}

// ---- item 6: private margin call (raise the proven floor without revealing the amount) ----

/// Open a 2-unit loan and return (root, position_id, lock_handle) for margin tests.
fn open_loan(f: &Fixture) -> (BytesN<32>, BytesN<32>, BytesN<32>) {
    let root = prime(f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let lock = b32(&f.env, 0x02);
    let j = journal(&f.env, &root, 2 * UNIT, &pid, &lock, &f.borrower);
    f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);
    (root, pid, lock)
}

#[test]
fn happy_path_margin_raises_floor() {
    let f = setup(0);
    let (root, pid, lock) = open_loan(&f);
    assert_eq!(f.vault.get_position(&pid).unwrap().floor, 2 * UNIT);

    // Re-prove the SAME locked note clears a HIGHER floor (5 units). No new USDC moves.
    let bal_before = f.usdc.balance(&f.borrower);
    let jm = journal(&f.env, &root, 5 * UNIT, &pid, &lock, &f.borrower);
    let new_floor = f.vault.margin(&digest_seal(&f.env, &jm), &jm, &f.borrower);

    assert_eq!(new_floor, 5 * UNIT);
    assert_eq!(f.vault.get_position(&pid).unwrap().floor, 5 * UNIT);
    assert_eq!(f.usdc.balance(&f.borrower), bal_before); // defensive only — no disbursement
}

#[test]
fn margin_on_missing_position_rejected() {
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let jm = journal(&f.env, &root, 5 * UNIT, &b32(&f.env, 0x55), &b32(&f.env, 0x02), &f.borrower);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jm), &jm, &f.borrower),
        Err(Ok(Error::NoPosition))
    );
}

#[test]
fn margin_must_strictly_raise_floor() {
    let f = setup(0);
    let (root, pid, lock) = open_loan(&f);
    // equal floor -> rejected
    let jeq = journal(&f.env, &root, 2 * UNIT, &pid, &lock, &f.borrower);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jeq), &jeq, &f.borrower),
        Err(Ok(Error::FloorNotRaised))
    );
    // lower floor -> rejected
    let jlo = journal(&f.env, &root, UNIT, &pid, &lock, &f.borrower);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jlo), &jlo, &f.borrower),
        Err(Ok(Error::FloorNotRaised))
    );
    assert_eq!(f.vault.get_position(&pid).unwrap().floor, 2 * UNIT); // unchanged
}

#[test]
fn margin_wrong_borrower_rejected() {
    let f = setup(0);
    let (root, pid, lock) = open_loan(&f);
    let other = Address::generate(&f.env); // proof bound to someone else
    let jm = journal(&f.env, &root, 5 * UNIT, &pid, &lock, &other);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jm), &jm, &f.borrower),
        Err(Ok(Error::WrongBorrower))
    );
}

#[test]
fn margin_lock_mismatch_rejected() {
    let f = setup(0);
    let (root, pid, _lock) = open_loan(&f);
    // same position id but a DIFFERENT locked note (lock handle) -> rejected
    let jm = journal(&f.env, &root, 5 * UNIT, &pid, &b32(&f.env, 0x09), &f.borrower);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jm), &jm, &f.borrower),
        Err(Ok(Error::LockMismatch))
    );
}

#[test]
fn margin_unknown_root_rejected() {
    let f = setup(0);
    let (_root, pid, lock) = open_loan(&f);
    let bad_root = b32(&f.env, 0xCD); // never relayed
    let jm = journal(&f.env, &bad_root, 5 * UNIT, &pid, &lock, &f.borrower);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jm), &jm, &f.borrower),
        Err(Ok(Error::UnknownRoot))
    );
}

#[test]
fn margin_on_closed_position_rejected() {
    let f = setup(0);
    let (root, pid, lock) = open_loan(&f);
    f.vault.repay(&pid);
    let jm = journal(&f.env, &root, 5 * UNIT, &pid, &lock, &f.borrower);
    assert_eq!(
        f.vault.try_margin(&digest_seal(&f.env, &jm), &jm, &f.borrower),
        Err(Ok(Error::AlreadyClosed))
    );
}

#[test]
fn margin_tampered_journal_reverts() {
    let f = setup(0);
    let (root, pid, lock) = open_loan(&f);
    let jm = journal(&f.env, &root, 5 * UNIT, &pid, &lock, &f.borrower);
    let seal = digest_seal(&f.env, &jm); // binds the 5-unit journal
    let jt = journal(&f.env, &root, 50 * UNIT, &pid, &lock, &f.borrower); // tamper threshold
    assert!(f.vault.try_margin(&seal, &jt, &f.borrower).is_err());
    assert_eq!(f.vault.get_position(&pid).unwrap().floor, 2 * UNIT); // unchanged
}

// ---- item 7: Soroban repaid-tree (R_sor) — the repay-proof the unlock guest folds ----

fn b32_hex(env: &Env, s: &str) -> BytesN<32> {
    let mut a = [0u8; 32];
    for i in 0..32 {
        a[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
    }
    BytesN::from_array(env, &a)
}

#[test]
fn repaid_root_starts_empty() {
    let f = setup(0);
    // depth-16 empty-tree root (zeros[16]); shared with guest zero_hashes(16).
    let empty16 = b32_hex(&f.env, "8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb");
    assert_eq!(f.vault.repaid_root(), empty16);
    assert_eq!(f.vault.repaid_count(), 0);
}

#[test]
fn repay_appends_to_repaid_tree() {
    let f = setup(0);
    let (_root, pid, _lock) = open_loan(&f);
    let before = f.vault.repaid_root();
    f.vault.repay(&pid);
    assert_ne!(f.vault.repaid_root(), before, "repay must append a repaid leaf");
    assert_eq!(f.vault.repaid_count(), 1);
}

#[test]
fn repaid_root_matches_cross_impl_vector() {
    // CROSS-IMPL VECTOR (depth 16): use the journal lock_handle the guest used as the repaid_leaf
    // input — lock_handle(lockId=0x02..02) = 188b06b2…b244. After one repay the Soroban tree root
    // must equal the guest's `merkle_root_from_path(repaid_leaf(lh), 0, zero_hashes(16))`.
    let f = setup(0);
    let root = prime(&f, 1_000_000_0000000i128);
    let pid = b32(&f.env, 0x01);
    let lock_h = b32_hex(&f.env, "188b06b26be1f9e52c6083507a0182e1bb2ff1be08cb0a7d0b4b5cde4935b244");
    let j = journal(&f.env, &root, 2 * UNIT, &pid, &lock_h, &f.borrower);
    f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);
    f.vault.repay(&pid);

    let expected = b32_hex(&f.env, "c560d2cefe358de23b6e70b7a5293e9d1926cbe6f40cc24df23eb10cd7f2df8e");
    assert_eq!(f.vault.repaid_root(), expected, "R_sor drifted from the shared guest vector");
}

#[test]
fn double_init_rejected() {
    let f = setup(0);
    let res = f.vault.try_init(
        &f.admin, &f.admin, &b32(&f.env, 1), &f.vault_id, &f.admin,
        &Asset::Other(symbol_short!("ETH")), &5_000u32, &1u128, &1u32, &0u32,
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}
