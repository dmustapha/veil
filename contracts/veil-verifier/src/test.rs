//! snarkjs ↔ Soroban cross-check (Phase 3 unit 3). The correctness gate: a Groth16 proof generated
//! off-chain by snarkjs (with the committed `keys/*.vk.json`) must verify inside the Soroban BN254
//! verifier, and a tampered public input must be rejected. Proves the on-chain verifier and the
//! client-side prover agree BEFORE anything is deployed. Fixtures are Soroban-encoded from the
//! snarkjs JSON by `circom/gen_fixtures.js`.
#![cfg(test)]

use crate::fixtures::{Fx, BORROW, LOCK, SEIZE, UNLOCK};
use crate::{verification_key_from_bytes, Groth16Proof, VeilVerifier, VerificationKeyBytes};
use soroban_sdk::{
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    BytesN, Env, Vec,
};

fn vk_bytes(env: &Env, fx: &Fx) -> VerificationKeyBytes {
    let mut ic: Vec<BytesN<64>> = Vec::new(env);
    for e in fx.vk_ic {
        ic.push_back(BytesN::from_array(env, e));
    }
    VerificationKeyBytes {
        alpha: BytesN::from_array(env, &fx.vk_alpha),
        beta: BytesN::from_array(env, &fx.vk_beta),
        gamma: BytesN::from_array(env, &fx.vk_gamma),
        delta: BytesN::from_array(env, &fx.vk_delta),
        ic,
    }
}

fn proof(env: &Env, fx: &Fx) -> Groth16Proof {
    Groth16Proof {
        a: Bn254G1Affine::from_bytes(BytesN::from_array(env, &fx.proof_a)),
        b: Bn254G2Affine::from_bytes(BytesN::from_array(env, &fx.proof_b)),
        c: Bn254G1Affine::from_bytes(BytesN::from_array(env, &fx.proof_c)),
    }
}

fn public_inputs(env: &Env, fx: &Fx) -> Vec<Bn254Fr> {
    let mut v: Vec<Bn254Fr> = Vec::new(env);
    for p in fx.public {
        v.push_back(Bn254Fr::from_bytes(BytesN::from_array(env, p)));
    }
    v
}

/// A real snarkjs proof verifies on Soroban; a tampered public input does not.
fn roundtrip(fx: &Fx, label: &str) {
    let env = Env::default();
    let vk = verification_key_from_bytes(&env, &vk_bytes(&env, fx));

    let ok = VeilVerifier::verify_with_vk(&env, &vk, proof(&env, fx), public_inputs(&env, fx));
    assert_eq!(ok, Ok(true), "{label}: snarkjs proof must verify on Soroban");

    // Tamper the first public signal → vk_x is wrong → the pairing check fails.
    let mut bad = public_inputs(&env, fx);
    bad.set(0, Bn254Fr::from_bytes(BytesN::from_array(&env, &[0x07u8; 32])));
    let tampered = VeilVerifier::verify_with_vk(&env, &vk, proof(&env, fx), bad);
    assert!(tampered.is_err(), "{label}: tampered public input must be rejected");
}

#[test]
fn borrow_proof_verifies_on_soroban() {
    roundtrip(&BORROW, "borrow");
}

#[test]
fn lock_proof_verifies_on_soroban() {
    roundtrip(&LOCK, "lock");
}

#[test]
fn unlock_proof_verifies_on_soroban() {
    roundtrip(&UNLOCK, "unlock");
}

#[test]
fn seize_proof_verifies_on_soroban() {
    roundtrip(&SEIZE, "seize");
}
