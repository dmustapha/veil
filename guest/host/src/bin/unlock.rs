//! Veil v2 unlock host.
//!
//! Builds an unlock-joinsplit witness (spend a LOCKED note → mint an AVAILABLE note of the same
//! hidden amount, gated on a Stellar repay-proof), runs the unlock guest, and independently
//! re-checks the committed journal. Under `RISC0_DEV_MODE` this is a fast logic check; with dev mode
//! unset (CI / Bonsai) it produces a real Groth16 receipt + seal that `VeilPool.unlock` verifies.
//!
//! Scenario: a LOCKED note at leaf 0 of an otherwise-empty depth-16 pool, and its `repaid_leaf` at
//! leaf 0 of an otherwise-empty depth-16 Soroban repaid-tree, so both Merkle paths are the zero-hash
//! path. (Real multi-leaf paths come from the off-chain note client and the vault's repaid-tree;
//! the guest logic is identical and covered by veil-core tests.)
use methods::{VEIL_UNLOCK_ELF, VEIL_UNLOCK_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::sha::Digest;
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde_json::json;
use sha2::{Digest as _, Sha256};
use veil_core::notes::{
    encode_unlock_journal, lock_handle, merkle_root_from_path, note_commitment, nullifier,
    repaid_leaf, zero_hashes, UnlockInput, DOMAIN_AVAILABLE, DOMAIN_LOCKED, UNLOCK_JOURNAL_LEN,
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
    let blinding_out = [0x88u8; 32];

    // Reconstruct the LOCKED input note (aux = lock_id) and its first-leaf Ethereum Merkle path.
    let c_in = note_commitment(DOMAIN_LOCKED, amount, &blinding_in, &spend_pk, &lock_id);
    let siblings_eth = zero_hashes(DEPTH);
    let root_eth = merkle_root_from_path(&c_in, 0, &siblings_eth);
    let nf = nullifier(&nk, &c_in, 0);

    // The repay-proof: repaid_leaf(lock_handle(lock_id)) at leaf 0 of the Soroban repaid-tree.
    let rl = repaid_leaf(&lock_handle(&lock_id));
    let siblings_sor = zero_hashes(DEPTH);
    let root_sor = merkle_root_from_path(&rl, 0, &siblings_sor);

    // The AVAILABLE output note carries the SAME amount (aux = 0).
    let c_out = note_commitment(DOMAIN_AVAILABLE, amount, &blinding_out, &spend_pk, &[0u8; 32]);

    let input = UnlockInput {
        root_eth,
        root_sor,
        nullifier_in: nf,
        commitment_out: c_out,
        amount,
        blinding_in,
        spend_pk,
        nk,
        lock_id,
        leaf_index: 0,
        siblings_eth: siblings_eth.clone(),
        blinding_out,
        repaid_leaf_index: 0,
        siblings_sor: siblings_sor.clone(),
    };

    // PRIVACY: the unlock journal exposes no amount — log only the public roots.
    println!("pool root  (public) = 0x{}", hex::encode(root_eth));
    println!("repaid root (public) = 0x{}", hex::encode(root_sor));

    let env = ExecutorEnv::builder().write(&input).unwrap().build().unwrap();
    let receipt = default_prover()
        .prove_with_opts(env, VEIL_UNLOCK_ELF, &ProverOpts::groth16())
        .unwrap()
        .receipt;
    if std::env::var("RISC0_DEV_MODE").is_err() {
        receipt.verify(VEIL_UNLOCK_ID).expect("real receipt failed to verify");
    }

    let journal = receipt.journal.bytes.to_vec();
    assert_eq!(journal.len(), UNLOCK_JOURNAL_LEN, "journal length");

    // Recompute the expected journal independently and compare.
    let expected = encode_unlock_journal(&root_eth, &root_sor, &nf, &c_out);
    assert_eq!(journal.as_slice(), &expected[..], "journal mismatch host vs guest");

    // Sanity: the secret amount must NOT appear anywhere in the public journal.
    assert!(
        !journal.windows(16).any(|w| w == amount.to_be_bytes()),
        "amount leaked into journal!"
    );

    let seal = encode_seal(&receipt).expect("encode_seal");
    let image_id = Digest::from(VEIL_UNLOCK_ID);
    let journal_digest = Sha256::digest(&journal);

    let out = json!({
        "seal": format!("0x{}", hex::encode(&seal)),
        "image_id": format!("0x{}", hex::encode(image_id.as_bytes())),
        "journal": format!("0x{}", hex::encode(&journal)),
        "journal_digest": format!("0x{}", hex::encode(journal_digest)),
        "root_eth": format!("0x{}", hex::encode(root_eth)),
        "root_sor": format!("0x{}", hex::encode(root_sor)),
        "nullifier_in": format!("0x{}", hex::encode(nf)),
        "commitment_out": format!("0x{}", hex::encode(c_out)),
    });
    std::fs::write("proof-unlock.json", serde_json::to_string_pretty(&out).unwrap()).unwrap();

    println!("✅ unlock proof: LOCKED note spent against a Stellar repay-proof → AVAILABLE note minted");
    println!("seal_len     = {} bytes", seal.len());
    println!("image_id     = 0x{}", hex::encode(image_id.as_bytes()));
    println!("journal      = 0x{}", hex::encode(&journal));
    println!("→ wrote proof-unlock.json");
}
