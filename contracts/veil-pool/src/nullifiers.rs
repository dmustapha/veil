//! Nullifier set — spent-note tracking that makes every note single-spend.
//!
//! A joinsplit publishes its input note's nullifier `nf` (a field element the circuit derives from
//! the secret nullifier key `nk`, the note commitment, and the leaf index — see v2
//! `guest/core/src/notes.rs::nullifier`, ported to Poseidon in Phase 2). The chain cannot and does
//! not recompute `nf` (nk is secret); it only records the published value and rejects any replay.
//! This module is the storage primitive; the verified-joinsplit path (Phase 4) calls `try_spend`
//! after a proof verifies, so there is no public unauthenticated way to burn a nullifier.

use soroban_sdk::{contracttype, Env, U256};

#[contracttype]
#[derive(Clone)]
enum NfKey {
    /// Presence marks the nullifier as spent.
    Spent(U256),
}

pub struct NullifierSet;

impl NullifierSet {
    /// Has this nullifier already been spent?
    pub fn is_spent(env: &Env, nf: &U256) -> bool {
        env.storage().persistent().has(&NfKey::Spent(nf.clone()))
    }

    /// Atomically mark `nf` spent. Returns `false` if it was already spent (a double-spend attempt),
    /// in which case the caller MUST reject the joinsplit; returns `true` on the first spend.
    pub fn try_spend(env: &Env, nf: &U256) -> bool {
        if Self::is_spent(env, nf) {
            return false;
        }
        // A spent nullifier must persist indefinitely, so bump its TTL like any other pool state —
        // an archived nullifier that stalls a spend must be restorable, never silently forgotten.
        let key = NfKey::Spent(nf.clone());
        env.storage().persistent().set(&key, &true);
        crate::ttl::bump(env, &key);
        true
    }
}
