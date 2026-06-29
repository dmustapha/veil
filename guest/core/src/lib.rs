//! Shared types between the Veil host and guest.
//!
//! The journal layout MUST stay byte-identical to `contracts/vault/src/journal.rs`.

/// v2 shielded-note cryptography (SHA-256 note commitments, Merkle membership, bindings).
pub mod notes;

use serde::{Deserialize, Serialize};

pub const JOURNAL_LEN: usize = 172;
/// Domain tag for the nullifier preimage: keccak256("veil-null" || escrow || hashlock).
pub const NULL_TAG: &[u8] = b"veil-null";

/// Guest input. Public params are re-committed; the rest are private witnesses that never
/// appear in the journal (the amount and the full account fields stay secret).
#[derive(Clone, Serialize, Deserialize)]
pub struct ProofInput {
    // --- public (re-committed to the journal) ---
    pub state_root: [u8; 32],
    pub block: u64,
    pub escrow: [u8; 20],
    pub threshold_wei: u128,
    pub hashlock: [u8; 32],
    /// Recipient binding: keccak256(borrower's canonical Stellar strkey ASCII). Committed publicly
    /// so the vault can assert `journal.recipient == keccak256(caller.strkey)` and refuse to let a
    /// stolen {seal, journal} be redeemed by anyone but the account it was proven for.
    pub recipient: [u8; 32],
    // --- private witnesses ---
    pub amount_wei: u128,
    pub amount_slot: [u8; 32],
    // account fields needed to reconstruct the account RLP for the account proof
    pub account_nonce: u64,
    pub account_balance: [u8; 32], // big-endian U256
    pub storage_hash: [u8; 32],
    pub code_hash: [u8; 32],
    // MPT proof nodes (RLP)
    pub account_proof: Vec<Vec<u8>>,
    pub storage_proof: Vec<Vec<u8>>,
}

/// Canonical 172-byte journal. Big-endian, fixed offsets:
/// `R(32) ‖ block(8) ‖ escrow(20) ‖ threshold(16) ‖ H(32) ‖ N(32) ‖ recipient(32)`.
pub fn encode_journal(
    state_root: &[u8; 32],
    block: u64,
    escrow: &[u8; 20],
    threshold_wei: u128,
    hashlock: &[u8; 32],
    nullifier: &[u8; 32],
    recipient: &[u8; 32],
) -> [u8; JOURNAL_LEN] {
    let mut out = [0u8; JOURNAL_LEN];
    out[0..32].copy_from_slice(state_root);
    out[32..40].copy_from_slice(&block.to_be_bytes());
    out[40..60].copy_from_slice(escrow);
    out[60..76].copy_from_slice(&threshold_wei.to_be_bytes());
    out[76..108].copy_from_slice(hashlock);
    out[108..140].copy_from_slice(nullifier);
    out[140..172].copy_from_slice(recipient);
    out
}
