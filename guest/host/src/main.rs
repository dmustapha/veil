//! Veil v2 borrow host.
//!
//! Builds a borrow witness for a LOCKED shielded note, runs the borrow guest, and independently
//! re-checks the committed journal. Under `RISC0_DEV_MODE` this is a fast logic check; with dev
//! mode unset (CI / Bonsai) it produces a real Groth16 receipt + seal the Soroban vault verifies.
//!
//! Scenario: a single note at leaf index 0 of an otherwise-empty depth-16 pool, so the Merkle
//! path is exactly the zero-hash path. (Multi-leaf paths are produced by the off-chain note
//! client from `Commitment` events; the guest logic is identical and covered by veil-core tests.)
use methods::{VEIL_PROVE_ELF, VEIL_PROVE_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::sha::Digest;
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde_json::json;
use sha2::{Digest as _, Sha256};
use veil_core::notes::{
    encode_borrow_journal, lock_handle, merkle_root_from_path, note_commitment, position_id,
    zero_hashes, BorrowInput, BORROW_JOURNAL_LEN, DOMAIN_LOCKED,
};

const DEPTH: usize = 16;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    // --- private witnesses (deterministic for this demo fixture) ---
    let amount: u128 = 2_000_000_000_000_000_000; // 2.0 wstETH base-units (PRIVATE)
    let blinding = [0x11u8; 32];
    let spend_pk = [0x22u8; 32];
    let lock_id = [0x33u8; 32];
    let loan_secret = [0x44u8; 32];
    // Borrower binding: hash of the borrower's Stellar strkey (demo value). The vault asserts
    // the journal's `borrower` equals the invoker's hash, so a stolen proof cannot be replayed.
    let borrower = [0x55u8; 32];

    // Public threshold strictly below the hidden amount so the position qualifies.
    let threshold: u128 = 1_000_000_000_000_000_000; // 1.0 wstETH-unit floor

    // Reconstruct the on-chain LOCKED note commitment and its first-leaf Merkle path.
    let commitment = note_commitment(DOMAIN_LOCKED, amount, &blinding, &spend_pk, &lock_id);
    let siblings = zero_hashes(DEPTH);
    let root = merkle_root_from_path(&commitment, 0, &siblings);

    let input = BorrowInput {
        root,
        threshold,
        amount,
        blinding,
        spend_pk,
        lock_id,
        leaf_index: 0,
        siblings: siblings.clone(),
        loan_secret,
        borrower,
    };

    // PRIVACY: log only the PUBLIC threshold — never `amount`. This host can run in public CI.
    println!("threshold (public) = {threshold} wstETH-units");
    println!("pool root (public) = 0x{}", hex::encode(root));

    let env = ExecutorEnv::builder().write(&input).unwrap().build().unwrap();
    let receipt = default_prover()
        .prove_with_opts(env, VEIL_PROVE_ELF, &ProverOpts::groth16())
        .unwrap()
        .receipt;
    if std::env::var("RISC0_DEV_MODE").is_err() {
        receipt.verify(VEIL_PROVE_ID).expect("real receipt failed to verify");
    }

    let journal = receipt.journal.bytes.to_vec();
    assert_eq!(journal.len(), BORROW_JOURNAL_LEN, "journal length");

    // Recompute the expected journal independently and compare.
    let expected = encode_borrow_journal(
        &root,
        threshold,
        &position_id(&loan_secret),
        &lock_handle(&lock_id),
        &borrower,
    );
    assert_eq!(journal.as_slice(), &expected[..], "journal mismatch host vs guest");

    // Sanity: the secret amount must NOT appear anywhere in the public journal.
    assert!(
        !journal.windows(16).any(|w| w == amount.to_be_bytes()),
        "amount leaked into journal!"
    );

    let seal = encode_seal(&receipt).expect("encode_seal");
    let image_id = Digest::from(VEIL_PROVE_ID);
    let journal_digest = Sha256::digest(&journal);

    let out = json!({
        "seal": format!("0x{}", hex::encode(&seal)),
        "image_id": format!("0x{}", hex::encode(image_id.as_bytes())),
        "journal": format!("0x{}", hex::encode(&journal)),
        "journal_digest": format!("0x{}", hex::encode(journal_digest)),
        "root": format!("0x{}", hex::encode(root)),
        "threshold": threshold.to_string(),
        "position_id": format!("0x{}", hex::encode(position_id(&loan_secret))),
        "lock_handle": format!("0x{}", hex::encode(lock_handle(&lock_id))),
        "borrower": format!("0x{}", hex::encode(borrower)),
    });
    std::fs::write("proof.json", serde_json::to_string_pretty(&out).unwrap()).unwrap();

    println!("✅ borrow proof: LOCKED note ≥ threshold, member of root; amount stays private");
    println!("seal_len     = {} bytes", seal.len());
    println!("image_id     = 0x{}", hex::encode(image_id.as_bytes()));
    println!("journal      = 0x{}", hex::encode(&journal));
    println!("→ wrote proof.json");
}
