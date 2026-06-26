//! Canonical Veil journal: the 140-byte public commitment the RISC Zero guest produces
//! via `env::commit_slice(&bytes)`, and which the vault decodes after the proof verifies.
//!
//! Layout (big-endian, fixed offsets):
//! ```text
//!  [  0.. 32) state_root  R  (32) — Ethereum state root the proof is against
//!  [ 32.. 40) block       B  ( 8) — block number of R (u64)
//!  [ 40.. 60) escrow      E  (20) — escrow contract address
//!  [ 60.. 76) threshold   T  (16) — collateral lower bound in wei (u128)
//!  [ 76..108) hashlock    H  (32) — keccak(S); binds escrow lock <-> loan
//!  [108..140) nullifier   N  (32) — keccak("veil-null"||E||H); one lock -> one loan
//! ```
use soroban_sdk::{Bytes, BytesN, Env};

pub const JOURNAL_LEN: u32 = 140;

#[derive(Clone)]
pub struct Journal {
    pub state_root: BytesN<32>,
    pub block: u64,
    pub escrow: BytesN<20>,
    pub threshold_wei: u128,
    pub hashlock: BytesN<32>,
    pub nullifier: BytesN<32>,
}

fn slice32(env: &Env, b: &Bytes, start: u32) -> BytesN<32> {
    let mut buf = [0u8; 32];
    b.slice(start..start + 32).copy_into_slice(&mut buf);
    BytesN::from_array(env, &buf)
}

/// Decode the canonical 140-byte journal. Panics if the length is wrong.
pub fn decode(env: &Env, j: &Bytes) -> Journal {
    if j.len() != JOURNAL_LEN {
        panic!("bad journal length");
    }
    let state_root = slice32(env, j, 0);

    let mut b8 = [0u8; 8];
    j.slice(32..40).copy_into_slice(&mut b8);
    let block = u64::from_be_bytes(b8);

    let mut e20 = [0u8; 20];
    j.slice(40..60).copy_into_slice(&mut e20);
    let escrow = BytesN::from_array(env, &e20);

    let mut t16 = [0u8; 16];
    j.slice(60..76).copy_into_slice(&mut t16);
    let threshold_wei = u128::from_be_bytes(t16);

    let hashlock = slice32(env, j, 76);
    let nullifier = slice32(env, j, 108);

    Journal { state_root, block, escrow, threshold_wei, hashlock, nullifier }
}

/// Size a loan in USDC (7 decimals) from a wei threshold, a Reflector price, and an LTV.
///
/// `loan_7dec = (t_wei / 1e11) * px * ltv_bps / 10^(4 + px_decimals)`
/// The `/1e11` (=1e-7 ETH, negligible) keeps the intermediate product inside i128 for
/// realistic demo sizes (<= ~1000 ETH). Returns USDC base units (7 decimals).
pub fn size_loan(t_wei: u128, px: i128, px_decimals: u32, ltv_bps: u32) -> i128 {
    assert!(px > 0, "bad price");
    assert!(ltv_bps > 0 && ltv_bps <= 10_000, "bad ltv");
    let reduced = (t_wei / 100_000_000_000u128) as i128; // t_wei / 1e11
    let num = reduced
        .checked_mul(px).expect("overflow px")
        .checked_mul(ltv_bps as i128).expect("overflow ltv");
    let denom = 10i128.pow(4 + px_decimals);
    num / denom
}
