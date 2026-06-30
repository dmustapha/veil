//! Veil v2 lock host.
//!
//! Builds a lock-joinsplit witness (spend an AVAILABLE note → mint a LOCKED note of the same hidden
//! amount), runs the lock guest, and independently re-checks the committed journal. Under
//! `RISC0_DEV_MODE` this is a fast logic check; with dev mode unset (CI / Bonsai) it produces a real
//! Groth16 receipt + seal that `VeilPool.lock` verifies on Ethereum.
//!
//! Scenario: a single AVAILABLE note at leaf index 0 of an otherwise-empty depth-16 pool, so the
//! Merkle path is exactly the zero-hash path. (Multi-leaf paths are produced by the off-chain note
//! client from `Commitment` events; the guest logic is identical and covered by veil-core tests.)
use methods::{VEIL_LOCK_ELF, VEIL_LOCK_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::sha::Digest;
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde_json::json;
use sha2::{Digest as _, Sha256};
use veil_core::notes::{
    encode_lock_journal, merkle_root_from_path, note_commitment, nullifier, zero_hashes, LockInput,
    DOMAIN_AVAILABLE, DOMAIN_LOCKED, LOCK_JOURNAL_LEN,
};

const DEPTH: usize = 16;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    // --- private witnesses (deterministic for this demo fixture) ---
    let amount: u128 = 2_000_000_000_000_000_000; // 2.0 wstETH base-units (PRIVATE)
    let blinding_in = [0x11u8; 32];
    let spend_pk = [0x22u8; 32];
    let nk = [0x66u8; 32];
    let lock_id = [0x33u8; 32];
    let blinding_out = [0x77u8; 32];

    // Reconstruct the AVAILABLE input note (aux = 0) and its first-leaf Merkle path.
    let c_in = note_commitment(DOMAIN_AVAILABLE, amount, &blinding_in, &spend_pk, &[0u8; 32]);
    let siblings = zero_hashes(DEPTH);
    let root = merkle_root_from_path(&c_in, 0, &siblings);
    let nf = nullifier(&nk, &c_in, 0);
    // The LOCKED output note carries the SAME amount, bound to lock_id (aux = lock_id).
    let c_out = note_commitment(DOMAIN_LOCKED, amount, &blinding_out, &spend_pk, &lock_id);

    let input = LockInput {
        root,
        nullifier_in: nf,
        commitment_out: c_out,
        lock_id,
        amount,
        blinding_in,
        spend_pk,
        nk,
        leaf_index: 0,
        siblings: siblings.clone(),
        blinding_out,
    };

    // PRIVACY: the lock journal exposes no amount at all — log only public roots/commitments.
    println!("pool root (public) = 0x{}", hex::encode(root));

    let env = ExecutorEnv::builder().write(&input).unwrap().build().unwrap();
    let receipt = default_prover()
        .prove_with_opts(env, VEIL_LOCK_ELF, &ProverOpts::groth16())
        .unwrap()
        .receipt;
    if std::env::var("RISC0_DEV_MODE").is_err() {
        receipt.verify(VEIL_LOCK_ID).expect("real receipt failed to verify");
    }

    let journal = receipt.journal.bytes.to_vec();
    assert_eq!(journal.len(), LOCK_JOURNAL_LEN, "journal length");

    // Recompute the expected journal independently and compare.
    let expected = encode_lock_journal(&root, &nf, &c_out, &lock_id);
    assert_eq!(journal.as_slice(), &expected[..], "journal mismatch host vs guest");

    // Sanity: the secret amount must NOT appear anywhere in the public journal.
    assert!(
        !journal.windows(16).any(|w| w == amount.to_be_bytes()),
        "amount leaked into journal!"
    );

    let seal = encode_seal(&receipt).expect("encode_seal");
    let image_id = Digest::from(VEIL_LOCK_ID);
    let journal_digest = Sha256::digest(&journal);

    let out = json!({
        "seal": format!("0x{}", hex::encode(&seal)),
        "image_id": format!("0x{}", hex::encode(image_id.as_bytes())),
        "journal": format!("0x{}", hex::encode(&journal)),
        "journal_digest": format!("0x{}", hex::encode(journal_digest)),
        "root": format!("0x{}", hex::encode(root)),
        "nullifier_in": format!("0x{}", hex::encode(nf)),
        "commitment_out": format!("0x{}", hex::encode(c_out)),
        "lock_id": format!("0x{}", hex::encode(lock_id)),
    });
    std::fs::write("proof-lock.json", serde_json::to_string_pretty(&out).unwrap()).unwrap();

    println!("✅ lock proof: spend AVAILABLE note → mint LOCKED note, same hidden amount conserved");
    println!("seal_len     = {} bytes", seal.len());
    println!("image_id     = 0x{}", hex::encode(image_id.as_bytes()));
    println!("journal      = 0x{}", hex::encode(&journal));
    println!("→ wrote proof-lock.json");
}
