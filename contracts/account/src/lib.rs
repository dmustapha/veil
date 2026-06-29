//! # VeilAccount — proof-as-authorization (Soroban custom account)
//!
//! A Soroban custom account whose authorization IS a RISC Zero proof. When any contract calls
//! `veil_account_address.require_auth()`, the host invokes `__check_auth` here, which verifies a
//! Veil Groth16 seal **on-chain** (the same BN254 verifier the vault uses) and only authorizes if
//! the proof is valid, bound to this account's recipient, and unused.
//!
//! This is the one move that makes Stellar structurally non-substitutable: EVM has no
//! protocol-level custom-account auth (ERC-4337 is app-level), so "the proof is the signature"
//! is native here. No re-bake is needed — it reuses the borrower-bound 172-byte journal from the
//! vault (the `recipient` field is exactly the binding `__check_auth` needs).
#![no_std]

#[cfg(test)]
mod test;

use risc0_interface::RiscZeroVerifierClient;
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    Address, Bytes, BytesN, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    BadJournalLen = 3,
    WrongRecipient = 4,
    ProofReused = 5,
}

/// The "signature" presented to `__check_auth`: a Veil proof, not an ed25519 sig.
#[contracttype]
#[derive(Clone)]
pub struct ProofSig {
    pub seal: Bytes,
    pub journal: Bytes,
}

#[contracttype]
#[derive(Clone)]
pub struct Cfg {
    pub verifier: Address,
    pub image_id: BytesN<32>,
    /// keccak256(this account's bound borrower strkey) — must equal the journal's recipient field.
    pub recipient: BytesN<32>,
}

#[contracttype]
enum DataKey {
    Cfg,
    Used(BytesN<32>), // nullifier -> consumed (one proof authorizes once)
}

const JOURNAL_LEN: u32 = 172;

fn slice32(env: &Env, b: &Bytes, start: u32) -> BytesN<32> {
    let mut buf = [0u8; 32];
    b.slice(start..start + 32).copy_into_slice(&mut buf);
    BytesN::from_array(env, &buf)
}

#[contract]
pub struct VeilAccount;

#[contractimpl]
impl VeilAccount {
    /// One-time setup: which verifier + image to trust, and which proof-recipient this account is.
    pub fn init(
        env: Env,
        verifier: Address,
        image_id: BytesN<32>,
        recipient: BytesN<32>,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Cfg) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Cfg, &Cfg { verifier, image_id, recipient });
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<Cfg, Error> {
        env.storage().instance().get(&DataKey::Cfg).ok_or(Error::NotInitialized)
    }

    pub fn is_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Used(nullifier))
    }
}

#[contractimpl]
impl CustomAccountInterface for VeilAccount {
    type Signature = ProofSig;
    type Error = Error;

    /// The proof IS the authorization. We ignore the ed25519-style signature_payload: authorization
    /// is granted by a valid, recipient-bound, unused Veil proof — verified on-chain right here.
    fn __check_auth(
        env: Env,
        _signature_payload: Hash<32>,
        sig: ProofSig,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        let cfg: Cfg = env
            .storage()
            .instance()
            .get(&DataKey::Cfg)
            .ok_or(Error::NotInitialized)?;

        // 1. Verify the Groth16 seal on-chain (BN254). Traps the whole auth on an invalid proof.
        let digest = env.crypto().sha256(&sig.journal);
        RiscZeroVerifierClient::new(&env, &cfg.verifier)
            .verify(&sig.seal, &cfg.image_id, &digest.into());

        // 2. The proof must be the one bound to THIS account (journal recipient field, [140..172)).
        if sig.journal.len() != JOURNAL_LEN {
            return Err(Error::BadJournalLen);
        }
        let recipient = slice32(&env, &sig.journal, 140);
        if recipient != cfg.recipient {
            return Err(Error::WrongRecipient);
        }

        // 3. One proof authorizes once (nullifier at [108..140)).
        let nullifier = slice32(&env, &sig.journal, 108);
        let nk = DataKey::Used(nullifier);
        if env.storage().persistent().has(&nk) {
            return Err(Error::ProofReused);
        }
        env.storage().persistent().set(&nk, &true);

        Ok(())
    }
}
