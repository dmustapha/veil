//! Veil v3 shielded-note cryptography (BN254 Poseidon2), the client-side-provable port of v2's
//! SHA-256 `guest/core/src/notes.rs`. Every hash here is byte-identical to a circom template so a
//! note committed on-chain is provable by the browser circuit (and vice versa). Built on the
//! GATE-T3-locked primitive `poseidon2_hash2` (circom `Poseidon2(2)`).

use crate::poseidon2::poseidon2_hash2;
use soroban_sdk::{Env, U256};

/// Note-domain separation tags (v2's `domain` byte, now carried by the Poseidon capacity element).
/// Because the WHOLE commitment chain is separated by these, a LOCKED note can never collide with
/// an AVAILABLE note of the same opening. Kept distinct from any other role tag (nullifier, etc.).
pub const DS_NOTE_AVAILABLE: u32 = 0x10;
pub const DS_NOTE_LOCKED: u32 = 0x11;

/// Nullifier-hash domain separation tag. DISTINCT from the note domains so a nullifier hash can
/// never collide with a note commitment (mirrors circom `Nullifier`).
pub const DS_NF: u32 = 0x20;

/// Single-input domain tags (v2's SHA256(TAG ‖ x) family, now Poseidon2). All distinct from the
/// note/nullifier domains and from each other, so no derived identifier collides across roles.
pub const DS_POS: u32 = 0x30; // position_id
pub const DS_LOCK: u32 = 0x31; // lock_handle
pub const DS_REPAID: u32 = 0x32; // repaid_leaf
pub const DS_LIQUIDATED: u32 = 0x33; // liquidated_leaf

/// Single-input domain hash `H1(x, ds) = poseidon2_hash2(x, 0, ds)` — the Poseidon2 port of v2's
/// `SHA256(TAG ‖ x)`. Reuses the GATE-T3-locked primitive; mirrors circom `DomainHash1`.
pub fn domain_hash1(env: &Env, x: &U256, ds: u32) -> U256 {
    let zero = U256::from_u32(env, 0);
    poseidon2_hash2(env, x.clone(), zero, Some(U256::from_u32(env, ds)))
}

/// Public loan identity bound to a borrower secret: `H1(loan_secret, DS_POS)` (v2 `position_id`).
pub fn position_id(env: &Env, loan_secret: &U256) -> U256 {
    domain_hash1(env, loan_secret, DS_POS)
}

/// Ties a loan to one on-chain lock: `H1(lock_id, DS_LOCK)` (v2 `lock_handle`).
pub fn lock_handle(env: &Env, lock_id: &U256) -> U256 {
    domain_hash1(env, lock_id, DS_LOCK)
}

/// The leaf the vault appends to the repaid-tree on repay: `H1(lock_handle, DS_REPAID)` (v2
/// `repaid_leaf`). The unlock circuit proves its membership in the repaid-root — so this MUST match
/// the circom `DomainHash1(lock_handle, 0x32)`.
pub fn repaid_leaf(env: &Env, lock_handle: &U256) -> U256 {
    domain_hash1(env, lock_handle, DS_REPAID)
}

/// The leaf the vault appends to the liquidated-tree on liquidation: `H1(lock_handle, DS_LIQUIDATED)`
/// (v2 `liquidated_leaf`). The seize circuit proves its membership in the liquidated-root.
pub fn liquidated_leaf(env: &Env, lock_handle: &U256) -> U256 {
    domain_hash1(env, lock_handle, DS_LIQUIDATED)
}

/// Note commitment — a domain-separated chain of `Poseidon2(2)` over the opening fields, mirroring
/// circom `NoteCommitment`:
///
/// ```text
/// C = H( H( H(amount, spendPk, ds), blinding, ds), aux, ds )      H = poseidon2_hash2
/// ```
///
/// `domain_ds` is [`DS_NOTE_AVAILABLE`] or [`DS_NOTE_LOCKED`]. `aux` carries the lockId for LOCKED
/// notes and is zero for AVAILABLE notes. All field inputs must be < the BN254 modulus (enforced by
/// `poseidon2_hash2`); intermediate hashes are already reduced.
pub fn note_commitment(
    env: &Env,
    domain_ds: u32,
    amount: &U256,
    spend_pk: &U256,
    blinding: &U256,
    aux: &U256,
) -> U256 {
    let ds = U256::from_u32(env, domain_ds);
    let h1 = poseidon2_hash2(env, amount.clone(), spend_pk.clone(), Some(ds.clone()));
    let h2 = poseidon2_hash2(env, h1, blinding.clone(), Some(ds.clone()));
    poseidon2_hash2(env, h2, aux.clone(), Some(ds))
}

/// Key-derived, Penumbra-style nullifier — the client-side-provable port of v2's
/// `SHA256(NF_TAG ‖ nk ‖ C ‖ leafIndex)` to a [`DS_NF`]-separated chain of `Poseidon2(2)`:
///
/// ```text
/// nf = H( H(nk, C, DS_NF), leafIndex, DS_NF )      H = poseidon2_hash2
/// ```
///
/// Unlinkable to the note without the nullifier key `nk`, deterministic given `(nk, C, leafIndex)`
/// so a double-spend of the same note yields the same nullifier. Computed by the browser prover and
/// note client (never on-chain); this reference exists to lock the circom cross-vector and to let
/// off-chain Rust tooling reproduce the exact circuit hash. Mirrors circom `Nullifier`.
pub fn nullifier(env: &Env, nk: &U256, commitment: &U256, leaf_index: &U256) -> U256 {
    let ds = U256::from_u32(env, DS_NF);
    let h1 = poseidon2_hash2(env, nk.clone(), commitment.clone(), Some(ds.clone()));
    poseidon2_hash2(env, h1, leaf_index.clone(), Some(ds))
}
