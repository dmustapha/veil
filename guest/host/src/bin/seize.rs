//! Veil v2 seize host.
//!
//! Builds a seize-joinsplit witness (spend a LIQUIDATED LOCKED note → split into a liquidator note
//! of the public floor `seized` + a hidden change note to the borrower), runs the seize guest, and
//! independently re-checks the committed journal. Under `RISC0_DEV_MODE` this is a fast logic check;
//! with dev mode unset (CI / Bonsai) it produces a real Groth16 receipt + seal that `VeilPool.seize`
//! verifies on Ethereum.
//!
//! Scenario: a LOCKED note at leaf 0 of an otherwise-empty depth-16 pool, and its `liquidated_leaf`
//! at leaf 0 of an otherwise-empty depth-16 Soroban liquidated-tree, so both Merkle paths are the
//! zero-hash path. `seized` is set strictly below the hidden `amount` so the change note is real and
//! the hidden total provably never appears in the journal.
use methods::{VEIL_SEIZE_ELF, VEIL_SEIZE_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::sha::Digest;
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde_json::json;
use sha2::{Digest as _, Sha256};
use veil_core::notes::{
    encode_seize_journal, liquidated_leaf, lock_handle, merkle_root_from_path, note_commitment,
    nullifier, zero_hashes, SeizeInput, DOMAIN_AVAILABLE, DOMAIN_LOCKED, SEIZE_JOURNAL_LEN,
};

const DEPTH: usize = 16;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    // --- private witnesses (deterministic for this demo fixture) ---
    let amount: u128 = 2_000_000_000_000_000_000; // 2.0 wstETH base-units total collateral (PRIVATE)
    let blinding_in = [0x11u8; 32];
    let spend_pk = [0x22u8; 32]; // borrower's key: owns the LOCKED note, receives the change
    let nk = [0x66u8; 32];
    let lock_id = [0x33u8; 32];
    let liquidator_pk = [0x99u8; 32]; // liquidator's key: receives the seized floor note
    let blinding_liquidator = [0xaau8; 32];
    let blinding_change = [0xbbu8; 32];

    // The PUBLIC proven floor the liquidator seizes — strictly below the hidden total so a real
    // change note returns to the borrower (and the hidden total never appears in the journal).
    let seized: u128 = 1_000_000_000_000_000_000; // 1.0 wstETH-unit floor (PUBLIC)

    // Reconstruct the LOCKED input note (aux = lock_id) and its first-leaf Ethereum Merkle path.
    let c_in = note_commitment(DOMAIN_LOCKED, amount, &blinding_in, &spend_pk, &lock_id);
    let siblings_eth = zero_hashes(DEPTH);
    let root_eth = merkle_root_from_path(&c_in, 0, &siblings_eth);
    let nf = nullifier(&nk, &c_in, 0);

    // The default-proof: liquidated_leaf(lock_handle(lock_id)) at leaf 0 of the liquidated-tree.
    let ll = liquidated_leaf(&lock_handle(&lock_id));
    let siblings_liq = zero_hashes(DEPTH);
    let root_liq = merkle_root_from_path(&ll, 0, &siblings_liq);

    // Liquidator note (public seized, aux = 0) and the hidden change note back to the borrower.
    let c_liq = note_commitment(DOMAIN_AVAILABLE, seized, &blinding_liquidator, &liquidator_pk, &[0u8; 32]);
    let c_change =
        note_commitment(DOMAIN_AVAILABLE, amount - seized, &blinding_change, &spend_pk, &[0u8; 32]);

    let input = SeizeInput {
        root_eth,
        root_liq,
        seized,
        nullifier_in: nf,
        commitment_liquidator: c_liq,
        commitment_change: c_change,
        amount,
        blinding_in,
        spend_pk,
        nk,
        lock_id,
        leaf_index: 0,
        siblings_eth: siblings_eth.clone(),
        liquidated_leaf_index: 0,
        siblings_liq: siblings_liq.clone(),
        liquidator_pk,
        blinding_liquidator,
        blinding_change,
    };

    // PRIVACY: log only the PUBLIC seized floor + roots — never the hidden total `amount`.
    println!("seized (public)      = {seized} wstETH-units");
    println!("pool root  (public)  = 0x{}", hex::encode(root_eth));
    println!("liquidated root (pub) = 0x{}", hex::encode(root_liq));

    let env = ExecutorEnv::builder().write(&input).unwrap().build().unwrap();
    let receipt = default_prover()
        .prove_with_opts(env, VEIL_SEIZE_ELF, &ProverOpts::groth16())
        .unwrap()
        .receipt;
    if std::env::var("RISC0_DEV_MODE").is_err() {
        receipt.verify(VEIL_SEIZE_ID).expect("real receipt failed to verify");
    }

    let journal = receipt.journal.bytes.to_vec();
    assert_eq!(journal.len(), SEIZE_JOURNAL_LEN, "journal length");

    // Recompute the expected journal independently and compare.
    let expected = encode_seize_journal(&root_eth, &root_liq, seized, &nf, &c_liq, &c_change);
    assert_eq!(journal.as_slice(), &expected[..], "journal mismatch host vs guest");

    // Sanity: the hidden total `amount` must NOT appear anywhere in the public journal (only the
    // public `seized` floor is exposed).
    assert!(
        !journal.windows(16).any(|w| w == amount.to_be_bytes()),
        "hidden total amount leaked into journal!"
    );

    let seal = encode_seal(&receipt).expect("encode_seal");
    let image_id = Digest::from(VEIL_SEIZE_ID);
    let journal_digest = Sha256::digest(&journal);

    let out = json!({
        "seal": format!("0x{}", hex::encode(&seal)),
        "image_id": format!("0x{}", hex::encode(image_id.as_bytes())),
        "journal": format!("0x{}", hex::encode(&journal)),
        "journal_digest": format!("0x{}", hex::encode(journal_digest)),
        "root_eth": format!("0x{}", hex::encode(root_eth)),
        "root_liq": format!("0x{}", hex::encode(root_liq)),
        "seized": seized.to_string(),
        "nullifier_in": format!("0x{}", hex::encode(nf)),
        "commitment_liquidator": format!("0x{}", hex::encode(c_liq)),
        "commitment_change": format!("0x{}", hex::encode(c_change)),
    });
    std::fs::write("proof-seize.json", serde_json::to_string_pretty(&out).unwrap()).unwrap();

    println!("✅ seize proof: LIQUIDATED note → liquidator gets the floor, borrower gets hidden change");
    println!("seal_len     = {} bytes", seal.len());
    println!("image_id     = 0x{}", hex::encode(image_id.as_bytes()));
    println!("journal      = 0x{}", hex::encode(&journal));
    println!("→ wrote proof-seize.json");
}
