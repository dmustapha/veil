#![cfg(test)]
extern crate std;

use crate::{Asset, Error, PriceData, VeilVault, VeilVaultClient};
use risc0_interface::VerifierError;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{
    contract, contractimpl, symbol_short, token, Address, Bytes, BytesN, Env,
};

// ---- inline mocks ----

/// Accepts iff the seal equals the journal digest passed in (binds proof <-> journal, so a
/// tampered journal fails verification — mirrors the real cryptographic binding).
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
    usdc_admin: token::StellarAssetClient<'a>,
    admin: Address,
    borrower: Address,
    escrow_addr: BytesN<20>,
}

const ETH_WEI: u128 = 1_000_000_000_000_000_000;

fn setup() -> Fixture<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);
    let issuer = Address::generate(&env);

    let vault_id = env.register(VeilVault, ());
    let vault = VeilVaultClient::new(&env, &vault_id);
    let verifier = env.register(MockVerifier, ());
    let reflector = env.register(MockReflector, ());

    let sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let usdc = token::TokenClient::new(&env, &sac.address());
    let usdc_admin = token::StellarAssetClient::new(&env, &sac.address());
    // Fund the vault so it can disburse.
    usdc_admin.mint(&vault_id, &1_000_000_0000000i128); // 1,000,000 USDC

    let image_id = BytesN::from_array(&env, &[0x11u8; 32]);
    let escrow_addr = BytesN::from_array(&env, &[0xEEu8; 20]);

    vault.init(
        &admin,
        &verifier,
        &image_id,
        &escrow_addr,
        &sac.address(),
        &reflector,
        &Asset::Other(symbol_short!("ETH")),
        &5_000u32,                  // 50% LTV
        &(ETH_WEI / 10),            // min threshold 0.1 ETH
        &(17_280u32 * 7),           // 7-day term
    );

    Fixture { env, vault, vault_id, usdc, usdc_admin, admin, borrower, escrow_addr }
}

// canonical 140-byte journal
fn journal(
    env: &Env,
    escrow: &BytesN<20>,
    block: u64,
    state_root: &BytesN<32>,
    threshold_wei: u128,
    h: &BytesN<32>,
    n: &BytesN<32>,
) -> Bytes {
    let mut b = Bytes::new(env);
    b.append(&Bytes::from_array(env, &state_root.to_array())); // 32
    b.append(&Bytes::from_array(env, &block.to_be_bytes()));   // 8
    b.append(&Bytes::from_array(env, &escrow.to_array()));     // 20
    b.append(&Bytes::from_array(env, &threshold_wei.to_be_bytes())); // 16
    b.append(&Bytes::from_array(env, &h.to_array()));          // 32
    b.append(&Bytes::from_array(env, &n.to_array()));          // 32
    b
}

fn digest_seal(env: &Env, j: &Bytes) -> Bytes {
    let d = env.crypto().sha256(j);
    Bytes::from_array(env, &d.to_bytes().to_array())
}

fn b32(env: &Env, x: u8) -> BytesN<32> {
    BytesN::from_array(env, &[x; 32])
}

#[test]
fn happy_path_borrow() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);

    let h = b32(&f.env, 0x01);
    let n = b32(&f.env, 0x02);
    let j = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &h, &n);
    let seal = digest_seal(&f.env, &j);

    let principal = f.vault.borrow(&seal, &j, &f.borrower);
    // 2 ETH * $1500 * 50% = $1500 = 1500.0000000 USDC
    assert_eq!(principal, 15_000_000_000i128);
    assert_eq!(f.usdc.balance(&f.borrower), 15_000_000_000i128);
    assert!(f.vault.is_nullifier_used(&n));
    let loan = f.vault.get_loan(&h).unwrap();
    assert_eq!(loan.principal, principal);
    assert!(!loan.repaid);
}

#[test]
fn tampered_journal_reverts() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);

    let h = b32(&f.env, 0x01);
    let n = b32(&f.env, 0x02);
    let j = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &h, &n);
    let seal = digest_seal(&f.env, &j); // seal binds the ORIGINAL journal

    // tamper: claim 100 ETH instead of 2 — seal no longer matches digest
    let jt = journal(&f.env, &f.escrow_addr, 100, &root, 100 * ETH_WEI, &h, &n);
    let res = f.vault.try_borrow(&seal, &jt, &f.borrower);
    assert!(res.is_err(), "tampered journal must revert");
    assert_eq!(f.usdc.balance(&f.borrower), 0); // no USDC moved
}

#[test]
fn unknown_checkpoint_rejected() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    // no checkpoint posted
    let h = b32(&f.env, 0x01);
    let n = b32(&f.env, 0x02);
    let j = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &h, &n);
    let seal = digest_seal(&f.env, &j);
    let res = f.vault.try_borrow(&seal, &j, &f.borrower);
    assert_eq!(res, Err(Ok(Error::UnknownCheckpoint)));
}

#[test]
fn checkpoint_mismatch_rejected() {
    let f = setup();
    f.vault.post_checkpoint(&100u64, &b32(&f.env, 0xAB));
    let j = journal(&f.env, &f.escrow_addr, 100, &b32(&f.env, 0xCD), 2 * ETH_WEI, &b32(&f.env, 1), &b32(&f.env, 2));
    let seal = digest_seal(&f.env, &j);
    assert_eq!(f.vault.try_borrow(&seal, &j, &f.borrower), Err(Ok(Error::CheckpointMismatch)));
}

#[test]
fn wrong_escrow_rejected() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);
    let bad_escrow = BytesN::from_array(&f.env, &[0x11u8; 20]);
    let j = journal(&f.env, &bad_escrow, 100, &root, 2 * ETH_WEI, &b32(&f.env, 1), &b32(&f.env, 2));
    let seal = digest_seal(&f.env, &j);
    assert_eq!(f.vault.try_borrow(&seal, &j, &f.borrower), Err(Ok(Error::WrongEscrow)));
}

#[test]
fn threshold_too_low_rejected() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);
    let j = journal(&f.env, &f.escrow_addr, 100, &root, ETH_WEI / 100, &b32(&f.env, 1), &b32(&f.env, 2)); // 0.01 ETH < 0.1 min
    let seal = digest_seal(&f.env, &j);
    assert_eq!(f.vault.try_borrow(&seal, &j, &f.borrower), Err(Ok(Error::ThresholdTooLow)));
}

#[test]
fn nullifier_replay_rejected() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);
    let n = b32(&f.env, 0x02);
    let j1 = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &b32(&f.env, 0x01), &n);
    f.vault.borrow(&digest_seal(&f.env, &j1), &j1, &f.borrower);
    // same nullifier, different hashlock
    let j2 = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &b32(&f.env, 0x09), &n);
    assert_eq!(f.vault.try_borrow(&digest_seal(&f.env, &j2), &j2, &f.borrower), Err(Ok(Error::NullifierUsed)));
}

#[test]
fn repay_reveals_secret_and_returns_principal() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);

    // secret S and hashlock H = keccak256(S)
    let s = b32(&f.env, 0x77);
    let h = f.env.crypto().keccak256(&Bytes::from_array(&f.env, &s.to_array())).to_bytes();
    let n = b32(&f.env, 0x02);
    let j = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &h, &n);
    let principal = f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);

    // borrower repays principal (already holds it from the loan)
    f.vault.repay(&h, &s);
    let loan = f.vault.get_loan(&h).unwrap();
    assert!(loan.repaid);
    assert_eq!(f.vault.get_secret(&h), Some(s));
    assert_eq!(f.usdc.balance(&f.borrower), 0); // returned principal
    let _ = principal;
}

#[test]
fn repay_wrong_secret_rejected() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);
    let s = b32(&f.env, 0x77);
    let h = f.env.crypto().keccak256(&Bytes::from_array(&f.env, &s.to_array())).to_bytes();
    let j = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &h, &b32(&f.env, 2));
    f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);
    let wrong = b32(&f.env, 0x66);
    assert_eq!(f.vault.try_repay(&h, &wrong), Err(Ok(Error::WrongSecret)));
}

#[test]
fn timeout_liquidation() {
    let f = setup();
    let root = b32(&f.env, 0xAB);
    f.vault.post_checkpoint(&100u64, &root);
    let h = b32(&f.env, 0x01);
    let j = journal(&f.env, &f.escrow_addr, 100, &root, 2 * ETH_WEI, &h, &b32(&f.env, 2));
    f.vault.borrow(&digest_seal(&f.env, &j), &j, &f.borrower);

    // before due
    assert_eq!(f.vault.try_liquidate_on_timeout(&h), Err(Ok(Error::NotYetDue)));
    // advance past term
    f.env.ledger().with_mut(|l| l.sequence_number += 17_280 * 7 + 1);
    f.vault.liquidate_on_timeout(&h);
    assert!(f.vault.get_loan(&h).unwrap().defaulted);
}

#[test]
fn double_init_rejected() {
    let f = setup();
    let res = f.vault.try_init(
        &f.admin, &f.admin, &b32(&f.env, 1), &f.escrow_addr, &f.vault_id, &f.admin,
        &Asset::Other(symbol_short!("ETH")), &5_000u32, &1u128, &1u32,
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}
