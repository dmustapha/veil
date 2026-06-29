//! Veil v2 borrow journal: the 144-byte public commitment the RISC Zero borrow guest produces
//! (`veil_core::notes::encode_borrow_journal`) and the vault decodes after the proof verifies.
//!
//! Layout (big-endian, fixed offsets) — MUST match `guest/core/src/notes.rs`:
//! ```text
//!  [  0.. 32) root         R  (32) — VeilPool Merkle root the membership proof is against
//!  [ 32.. 48) threshold    T  (16) — collateral floor in wstETH base-units (u128)
//!  [ 48.. 80) position_id     (32) — SHA256("VEIL_POS"||loanSecret); public loan identity
//!  [ 80..112) lockHandle      (32) — SHA256("VEIL_LOCK"||lockId); ties loan to one on-chain lock
//!  [112..144) borrower        (32) — keccak256(borrower Stellar strkey); anti-replay binding
//! ```
use soroban_sdk::{Bytes, BytesN, Env};

pub const JOURNAL_LEN: u32 = 144;

#[derive(Clone)]
pub struct Journal {
    pub root: BytesN<32>,
    pub threshold: u128,
    pub position_id: BytesN<32>,
    pub lock_handle: BytesN<32>,
    pub borrower: BytesN<32>,
}

fn slice32(env: &Env, b: &Bytes, start: u32) -> BytesN<32> {
    let mut buf = [0u8; 32];
    b.slice(start..start + 32).copy_into_slice(&mut buf);
    BytesN::from_array(env, &buf)
}

/// Decode the canonical 144-byte v2 borrow journal. Panics if the length is wrong.
pub fn decode(env: &Env, j: &Bytes) -> Journal {
    if j.len() != JOURNAL_LEN {
        panic!("bad journal length");
    }
    let root = slice32(env, j, 0);

    let mut t16 = [0u8; 16];
    j.slice(32..48).copy_into_slice(&mut t16);
    let threshold = u128::from_be_bytes(t16);

    let position_id = slice32(env, j, 48);
    let lock_handle = slice32(env, j, 80);
    let borrower = slice32(env, j, 112);

    Journal { root, threshold, position_id, lock_handle, borrower }
}

/// Size a loan in USDC (7 decimals) from a wstETH-unit threshold, a Reflector price, and an LTV.
///
/// `loan_7dec = (t_units / 1e11) * px * ltv_bps / 10^(4 + px_decimals)`
/// The `/1e11` keeps the intermediate product inside i128 for realistic demo sizes. Returns USDC
/// base units (7 decimals). (wstETH base-units share ETH's 1e18 scale, so the formula matches v1.)
pub fn size_loan(t_units: u128, px: i128, px_decimals: u32, ltv_bps: u32) -> i128 {
    assert!(px > 0, "bad price");
    assert!(ltv_bps > 0 && ltv_bps <= 10_000, "bad ltv");
    let reduced = (t_units / 100_000_000_000u128) as i128; // t_units / 1e11
    let num = reduced
        .checked_mul(px)
        .expect("overflow px")
        .checked_mul(ltv_bps as i128)
        .expect("overflow ltv");
    let denom = 10i128.pow(4 + px_decimals);
    num / denom
}
