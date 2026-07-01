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
