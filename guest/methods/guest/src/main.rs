//! Veil v2 borrow guest.
//!
//! Proves, in zero knowledge, that a **LOCKED** shielded note with `amount >= threshold`
//! is a member of the public Merkle root `R` of `VeilPool` — without revealing the amount,
//! the blinding, the owner key, or which leaf. Binds the loan to a `position_id` and the
//! collateral to a `lockHandle`, and binds the proof to the `borrower`'s Stellar account so a stolen
//! proof cannot be replayed. Commits only the 144-byte journal `{R, T, position_id, lockHandle, borrower}`.
//!
//! Native Merkle verification on Soroban could check membership but could NOT hide the amount —
//! that is why this SNARK is load-bearing. All proof logic lives in `veil_core::notes` (pure,
//! unit-tested, and byte-locked to `VeilPool.sol` via a shared cross-impl root vector); the guest
//! is the thin zkVM wrapper that reads the witness and commits the journal.
use risc0_zkvm::guest::env;
use veil_core::notes::{verify_borrow, BorrowInput};

fn main() {
    let input: BorrowInput = env::read();
    // PRIVACY: `input.amount` is a private witness and must never be committed or printed.
    let journal = verify_borrow(&input);
    env::commit_slice(&journal);
}
