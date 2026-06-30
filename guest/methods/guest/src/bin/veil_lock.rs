//! Veil v2 lock guest.
//!
//! Proves, in zero knowledge, a **lock joinsplit**: spend an AVAILABLE shielded note that is a
//! member of the public pool root `R`, publish its key-derived nullifier, and mint a LOCKED note of
//! the SAME hidden amount bound to `lockId` — without revealing the amount, the blinding, or the
//! owner key. On-chain the result looks like any internal transfer (no amount, no link to the loan).
//! Commits only the 128-byte journal `{R, nullifier_in, commitment_out, lockId}`.
//!
//! Value is conserved structurally inside `verify_lock` (one private `amount` feeds both
//! commitments), so the proof cannot mint a LOCKED note worth more or less than the spent note.
//! All logic lives in `veil_core::notes` (pure, unit-tested, byte-locked to `VeilPool.sol`); the
//! guest is the thin zkVM wrapper that reads the witness and commits the journal.
use risc0_zkvm::guest::env;
use veil_core::notes::{verify_lock, LockInput};

fn main() {
    let input: LockInput = env::read();
    // PRIVACY: `input.amount`, `blinding_in`, `blinding_out`, and `nk` are private witnesses and
    // must never be committed or printed.
    let journal = verify_lock(&input);
    env::commit_slice(&journal);
}
