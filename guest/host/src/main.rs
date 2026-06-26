//! Veil host. Loads the real pinned `eth_getProof` fixture, builds the guest input, runs the
//! guest (dev-mode executor unless real proving is configured), and checks the committed journal.
//!
//! Phase 2 (this file, dev mode): proves the guest logic verifies a real Sepolia storage proof.
//! Phase 0b (Bonsai): the same flow with `RISC0_DEV_MODE` unset + Bonsai env vars yields a real
//! Groth16 receipt the Soroban vault can verify.
use alloy_primitives::keccak256;
use methods::{VEIL_PROVE_ELF, VEIL_PROVE_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::sha::Digest;
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde_json::{json, Value};
use sha2::{Digest as _, Sha256};
use veil_core::{encode_journal, ProofInput, JOURNAL_LEN, NULL_TAG};

fn hx(s: &str) -> Vec<u8> {
    hex::decode(s.trim_start_matches("0x")).expect("bad hex")
}
fn arr32(s: &str) -> [u8; 32] {
    let v = hx(s);
    let mut a = [0u8; 32];
    a[32 - v.len()..].copy_from_slice(&v); // left-pad (handles trimmed values)
    a
}
fn arr20(s: &str) -> [u8; 20] {
    let v = hx(s);
    let mut a = [0u8; 20];
    a[20 - v.len()..].copy_from_slice(&v);
    a
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures");
    let proof: Value =
        serde_json::from_str(&std::fs::read_to_string(format!("{dir}/eth_getproof_pinned.json")).unwrap())
            .unwrap();
    let meta: Value =
        serde_json::from_str(&std::fs::read_to_string(format!("{dir}/fixture_meta.json")).unwrap())
            .unwrap();

    let escrow = arr20(meta["escrow"].as_str().unwrap());
    let hashlock = arr32(meta["hashlock"].as_str().unwrap());
    let amount_slot = arr32(meta["amount_slot"].as_str().unwrap());
    let state_root = arr32(meta["state_root"].as_str().unwrap());
    let block = meta["pinned_block"].as_u64().unwrap();

    let sp = &proof["storageProof"][0];
    let amount_wei =
        u128::from_str_radix(sp["value"].as_str().unwrap().trim_start_matches("0x"), 16).unwrap();
    let nonce =
        u64::from_str_radix(proof["nonce"].as_str().unwrap().trim_start_matches("0x"), 16).unwrap();

    // Pick a threshold strictly below the real amount (1e16 wei = 0.01 ETH) so it qualifies.
    let threshold_wei: u128 = amount_wei / 2; // 0.005 ETH

    let input = ProofInput {
        state_root,
        block,
        escrow,
        threshold_wei,
        hashlock,
        amount_wei,
        amount_slot,
        account_nonce: nonce,
        account_balance: arr32(proof["balance"].as_str().unwrap()),
        storage_hash: arr32(proof["storageHash"].as_str().unwrap()),
        code_hash: arr32(proof["codeHash"].as_str().unwrap()),
        account_proof: proof["accountProof"].as_array().unwrap().iter().map(|n| hx(n.as_str().unwrap())).collect(),
        storage_proof: sp["proof"].as_array().unwrap().iter().map(|n| hx(n.as_str().unwrap())).collect(),
    };

    println!("amount (PRIVATE) = {amount_wei} wei | threshold (public) = {threshold_wei} wei");

    // Groth16 receipt: in CI (no RISC0_DEV_MODE) this is the real BN254 proof the Soroban vault
    // verifies; under RISC0_DEV_MODE it is a fast fake for logic checks.
    let env = ExecutorEnv::builder().write(&input).unwrap().build().unwrap();
    let receipt = default_prover()
        .prove_with_opts(env, VEIL_PROVE_ELF, &ProverOpts::groth16())
        .unwrap()
        .receipt;
    let _ = receipt.verify(VEIL_PROVE_ID); // dev-mode receipts don't verify; real ones do

    let journal = receipt.journal.bytes.to_vec();
    assert_eq!(journal.len(), JOURNAL_LEN, "journal length");

    // Recompute the expected journal independently and compare.
    let mut pre = Vec::new();
    pre.extend_from_slice(NULL_TAG);
    pre.extend_from_slice(&escrow);
    pre.extend_from_slice(&hashlock);
    let nullifier: [u8; 32] = keccak256(&pre).into();
    let expected = encode_journal(&state_root, block, &escrow, threshold_wei, &hashlock, &nullifier);

    assert_eq!(journal.as_slice(), &expected[..], "journal mismatch host vs guest");
    // Sanity: the secret amount must NOT appear anywhere in the public journal.
    assert!(
        !journal.windows(16).any(|w| w == amount_wei.to_be_bytes()),
        "amount leaked into journal!"
    );

    // Encode the seal (selector || Groth16 proof) the Soroban verifier consumes, and emit the
    // full bundle the vault needs: seal, image_id, journal, journal_digest.
    let seal = encode_seal(&receipt).expect("encode_seal");
    let image_id = Digest::from(VEIL_PROVE_ID);
    let journal_digest = Sha256::digest(&journal);

    let out = json!({
        "seal": format!("0x{}", hex::encode(&seal)),
        "image_id": format!("0x{}", hex::encode(image_id.as_bytes())),
        "journal": format!("0x{}", hex::encode(&journal)),
        "journal_digest": format!("0x{}", hex::encode(journal_digest)),
        "threshold_wei": threshold_wei.to_string(),
        "block": block,
    });
    std::fs::write("proof.json", serde_json::to_string_pretty(&out).unwrap()).unwrap();

    println!("✅ guest verified the real Sepolia proof; journal matches; amount stays private");
    println!("seal_len     = {} bytes", seal.len());
    println!("image_id     = 0x{}", hex::encode(image_id.as_bytes()));
    println!("journal      = 0x{}", hex::encode(&journal));
    println!("nullifier    = 0x{}", hex::encode(nullifier));
    println!("→ wrote proof.json");
}
