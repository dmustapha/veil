//! Anonymity-set seeding — deterministic decoy AVAILABLE-note deposits.
//!
//! A shielded pool with few notes gives weak privacy: a real borrower's lock-joinsplit stands out.
//! Decoys are *real, backed* AVAILABLE notes the seeder deposits into `VeilPool` so genuine deposits
//! and locks hide in the crowd (privacy is quantified by anonymity-set size, like every mixer).
//!
//! Each decoy's `blinding` and `spendPk` are derived deterministically from a master seed, so the
//! seeder can re-open (and later reclaim the escrowed wstETH of) every decoy it planted — a decoy is
//! a genuine note, never a junk leaf. The commitment is the SAME byte-locked `note_commitment` the
//! contract recomputes on `deposit`, so a decoy is indistinguishable from a user note on-chain.
//!
//! PRIVACY: a decoy's `amount` is public (it is escrowed transparently, exactly like a real deposit);
//! the seed-derived `blinding`/`spendPk` are the seeder's own secrets, never a user witness. They are
//! written only to the gitignored seed artifact so escrow can be reclaimed, never committed.
use crate::notes::{note_commitment, DOMAIN_AVAILABLE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Domain tags for seed-derived decoy secrets (distinct so the three secrets never collide).
pub const DECOY_BLIND_TAG: &[u8] = b"VEIL_DECOY_BLIND";
pub const DECOY_PK_TAG: &[u8] = b"VEIL_DECOY_PK";
pub const DECOY_NK_TAG: &[u8] = b"VEIL_DECOY_NK";

/// A single decoy deposit: the public leaf the contract inserts (`amount`, `commitment`) plus the
/// seed-derived opening the seeder keeps to reclaim the escrow later. The opening needs `blinding`
/// and `spend_pk` to re-derive the commitment AND `nk` (the nullifier key) to spend the note when an
/// AVAILABLE→withdraw path exists — `nk` is independent of the committed `spend_pk` in this
/// construction (matching the host drivers), so without it the escrow would be stranded.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DecoyNote {
    pub index: u64,
    pub amount: u128,
    pub blinding: [u8; 32],
    pub spend_pk: [u8; 32],
    pub nk: [u8; 32],
    pub commitment: [u8; 32],
}

/// Deterministically derive 32 bytes from a tag, the master seed, and the decoy index.
fn derive(tag: &[u8], seed: &[u8; 32], index: u64) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(tag);
    h.update(seed);
    h.update(index.to_be_bytes());
    h.finalize().into()
}

/// Derive decoy `index` (an AVAILABLE note worth `amount`) deterministically from `seed`.
pub fn decoy_note(seed: &[u8; 32], index: u64, amount: u128) -> DecoyNote {
    let blinding = derive(DECOY_BLIND_TAG, seed, index);
    let spend_pk = derive(DECOY_PK_TAG, seed, index);
    let nk = derive(DECOY_NK_TAG, seed, index);
    let commitment = note_commitment(DOMAIN_AVAILABLE, amount, &blinding, &spend_pk, &[0u8; 32]);
    DecoyNote { index, amount, blinding, spend_pk, nk, commitment }
}

/// Build a decoy anonymity set: one decoy per entry in `amounts`, indexed `0..amounts.len()`.
pub fn decoy_set(seed: &[u8; 32], amounts: &[u128]) -> Vec<DecoyNote> {
    amounts
        .iter()
        .enumerate()
        .map(|(i, &amount)| decoy_note(seed, i as u64, amount))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    const SEED: [u8; 32] = [0x5e; 32];

    #[test]
    fn decoy_is_deterministic() {
        let a = decoy_note(&SEED, 7, 1_000);
        let b = decoy_note(&SEED, 7, 1_000);
        assert_eq!(a, b, "same seed/index/amount must reproduce the same decoy");
    }

    #[test]
    fn decoy_commitment_is_a_real_available_note() {
        // A decoy must be a genuine AVAILABLE note the contract will accept (re-derivable from its
        // opening), not a junk leaf — otherwise the escrow is unreclaimable and the set is fake.
        let d = decoy_note(&SEED, 3, 42);
        let expected =
            note_commitment(DOMAIN_AVAILABLE, d.amount, &d.blinding, &d.spend_pk, &[0u8; 32]);
        assert_eq!(d.commitment, expected, "decoy commitment must open under its own witness");
    }

    #[test]
    fn decoys_are_distinct_across_index_and_seed() {
        let d0 = decoy_note(&SEED, 0, 1_000);
        let d1 = decoy_note(&SEED, 1, 1_000);
        assert_ne!(d0.blinding, d1.blinding, "per-index blinding must differ");
        assert_ne!(d0.spend_pk, d1.spend_pk, "per-index spendPk must differ");
        assert_ne!(d0.nk, d1.nk, "per-index nk must differ");
        assert_ne!(d0.commitment, d1.commitment, "same amount, different index → different leaf");

        // The three secrets are domain-separated, so they never collide within one decoy.
        assert_ne!(d0.blinding, d0.spend_pk);
        assert_ne!(d0.blinding, d0.nk);
        assert_ne!(d0.spend_pk, d0.nk);

        let other_seed = decoy_note(&[0x11; 32], 0, 1_000);
        assert_ne!(d0.commitment, other_seed.commitment, "a different seed must shift the set");
    }

    #[test]
    fn decoy_set_indexes_amounts_and_stays_unlinkable() {
        let amounts = [10u128, 20, 30, 10]; // repeated amount must still yield a distinct leaf
        let set = decoy_set(&SEED, &amounts);
        assert_eq!(set.len(), amounts.len());
        for (i, d) in set.iter().enumerate() {
            assert_eq!(d.index, i as u64);
            assert_eq!(d.amount, amounts[i]);
            assert_eq!(d, &decoy_note(&SEED, i as u64, amounts[i]));
        }
        let commitments: HashSet<_> = set.iter().map(|d| d.commitment).collect();
        assert_eq!(commitments.len(), amounts.len(), "even repeated amounts give unique leaves");
    }
}
