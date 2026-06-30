//! Veil v2 unlock guest.
//!
//! Proves, in zero knowledge, a **reverse joinsplit**: spend a LOCKED shielded note in the Ethereum
//! pool root `R_eth`, prove (THE INVARIANT) that the Stellar position tied to its `lockId` was
//! REPAID — `repaid_leaf(lock_handle(lockId))` is a member of the Soroban repaid-root `R_sor` —
//! then publish the LOCKED note's nullifier and mint an AVAILABLE note of the SAME hidden amount.
//! Commits only the 128-byte journal `{R_eth, R_sor, nullifier_in, commitment_out}` (`lockId` is
//! deliberately NOT published, minimizing the lock↔unlock link).
//!
//! The repay-proof is non-optional, so a borrower can never recover spendable collateral without
//! repaying (the v1 "keep loan + collateral" hole stays closed). All logic lives in
//! `veil_core::notes`; the guest is the thin zkVM wrapper that reads the witness and commits the
//! journal.
use risc0_zkvm::guest::env;
use veil_core::notes::{verify_unlock, UnlockInput};

fn main() {
    let input: UnlockInput = env::read();
    // PRIVACY: `input.amount`, blindings, `nk`, and `lock_id` are private witnesses and must never
    // be committed or printed.
    let journal = verify_unlock(&input);
    env::commit_slice(&journal);
}
