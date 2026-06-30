//! Veil v2 seize guest.
//!
//! Proves, in zero knowledge, a **1-in/2-out joinsplit**: spend a LOCKED shielded note in the
//! Ethereum pool root `R_eth`, prove (THE GATE) the Stellar position tied to its `lockId` was
//! LIQUIDATED — `liquidated_leaf(lock_handle(lockId))` is a member of `R_liq` — then split the
//! value into a liquidator note worth the PUBLIC floor `seized` and a change note worth the hidden
//! remainder back to the borrower. Commits only the 176-byte journal
//! `{R_eth, R_liq, seized, nullifier_in, commitment_liquidator, commitment_change}`.
//!
//! Value is conserved structurally inside `verify_seize` (`seized + change == amount`), so the
//! liquidator cannot seize more than the note was worth and the borrower can never be over-seized.
//! `seized` (the proven floor) is the only public amount; the borrower's total collateral and the
//! change stay hidden. All logic lives in `veil_core::notes`; the guest is the thin zkVM wrapper.
use risc0_zkvm::guest::env;
use veil_core::notes::{verify_seize, SeizeInput};

fn main() {
    let input: SeizeInput = env::read();
    // PRIVACY: `input.amount` (total collateral), blindings, and `nk` are private witnesses and must
    // never be committed or printed. Only `seized` is public.
    let journal = verify_seize(&input);
    env::commit_slice(&journal);
}
