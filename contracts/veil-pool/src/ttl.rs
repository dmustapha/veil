//! Persistent-storage TTL policy. On Soroban a persistent entry whose time-to-live lapses is
//! archived and can't be read until restored — which would strand escrowed collateral (the tree
//! nodes recording note ownership) and stall spends (the nullifier set). Mirrors the sibling
//! `vault-v2` convention: bump every persistent write to a 30-day horizon.

use soroban_sdk::{Env, IntoVal, Val};

/// Ledgers per day at ~5s/ledger.
pub(crate) const DAY_LEDGERS: u32 = 17_280;
/// Extend persistent entries to ~30 days on every write.
pub(crate) const BUMP_AMOUNT: u32 = 30 * DAY_LEDGERS;
/// Re-bump once an entry drops within ~1 day of expiry.
pub(crate) const BUMP_THRESHOLD: u32 = BUMP_AMOUNT - DAY_LEDGERS;

/// Extend a persistent entry's TTL to [`BUMP_AMOUNT`] ledgers.
pub(crate) fn bump<K: IntoVal<Env, Val>>(env: &Env, key: &K) {
    env.storage().persistent().extend_ttl(key, BUMP_THRESHOLD, BUMP_AMOUNT);
}
