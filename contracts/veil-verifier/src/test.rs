//! snarkjs ↔ Soroban cross-check (Phase 3 unit 3). The correctness gate: a Groth16 proof generated
//! off-chain by snarkjs (with the committed `keys/*.vk.json`) must verify inside the Soroban BN254
//! verifier, and a tampered public input must be rejected. Proves the on-chain verifier and the
//! client-side prover agree BEFORE anything is deployed. Fixtures are Soroban-encoded from the
//! snarkjs JSON by `circom/gen_fixtures.js`.
#![cfg(test)]

use crate::fixtures::{Fx, BORROW, LOCK, RELEASE_REPAID, SEIZE, UNLOCK};
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

#[test]
fn release_repaid_proof_verifies_on_soroban() {
    roundtrip(&RELEASE_REPAID, "release_repaid");
}

/// Audit H-01: the tests above use a RUNTIME vk from fixtures; the deployed contract instead uses
/// the build.rs-EMBEDDED vk via `verify()`. build.rs defaults to the BORROW vkey, so assert the
/// embedded constants byte-match the SDK-validated fixture — a build.rs transcoding bug (endianness,
/// swapped G2 halves, wrong IC order/count) would fail here instead of shipping silently. Skips if a
/// non-borrow vkey (or the zero placeholder) was embedded via VERIFIER_VK_JSON.
#[test]
fn embedded_vk_matches_borrow_fixture() {
    if crate::VK_ALPHA_G1 != BORROW.vk_alpha {
        return; // a different circuit's vkey (or placeholder) is embedded — not this test's target.
    }
    assert_eq!(crate::VK_BETA_G2, BORROW.vk_beta, "embedded beta != fixture");
    assert_eq!(crate::VK_GAMMA_G2, BORROW.vk_gamma, "embedded gamma != fixture");
    assert_eq!(crate::VK_DELTA_G2, BORROW.vk_delta, "embedded delta != fixture");
    assert_eq!(crate::VK_IC.len(), BORROW.vk_ic.len(), "embedded IC len != fixture");
    for (i, (a, b)) in crate::VK_IC.iter().zip(BORROW.vk_ic).enumerate() {
        assert_eq!(a, b, "embedded IC[{i}] != fixture");
    }
}

/// Audit H-01: exercise the actual deployed entry point `verify()` (embedded vk) — a real borrow
/// proof verifies and a tampered public input is rejected. Runs only when the borrow vk is embedded.
#[test]
fn embedded_verify_accepts_borrow_and_rejects_tamper() {
    if crate::VK_ALPHA_G1 != BORROW.vk_alpha {
        return;
    }
    let env = Env::default();
    let ok = VeilVerifier::verify(env.clone(), proof(&env, &BORROW), public_inputs(&env, &BORROW));
    assert_eq!(ok, Ok(true), "embedded verify() must accept a real borrow proof");

    let mut bad = public_inputs(&env, &BORROW);
    bad.set(0, Bn254Fr::from_bytes(BytesN::from_array(&env, &[0x07u8; 32])));
    assert!(
        VeilVerifier::verify(env.clone(), proof(&env, &BORROW), bad).is_err(),
        "embedded verify() must reject a tampered public input"
    );
}
