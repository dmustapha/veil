//! Veil privacy guest.
//!
//! Proves: an Ethereum account `escrow` in state root `R` holds, at storage slot `amount_slot`,
//! a value `amount >= threshold`, under hashlock `H` — with the exact `amount` and the account's
//! full contents kept PRIVATE. Commits only the 140-byte journal `{R, block, escrow, threshold,
//! H, nullifier}`. Native Merkle verification on Soroban could check the proof but could NOT hide
//! the amount; that is why this SNARK is load-bearing.
use alloy_primitives::{keccak256, Bytes, B256, U256};
use alloy_rlp::{encode as rlp_encode, RlpEncodable};
use alloy_trie::{proof::verify_proof, Nibbles};
use risc0_zkvm::guest::env;
use veil_core::{encode_journal, ProofInput, NULL_TAG};

/// Ethereum account record as stored in the state trie: RLP([nonce, balance, storageRoot, codeHash]).
#[derive(RlpEncodable)]
struct TrieAccount {
    nonce: u64,
    balance: U256,
    storage_root: B256,
    code_hash: B256,
}

fn main() {
    let input: ProofInput = env::read();

    // 1. Account proof: reconstruct the account RLP from witnessed fields and prove it lives in R.
    //    A wrong storage_hash would make this RLP fail against the state root, so the storage root
    //    we trust below is itself authenticated here.
    let state_root = B256::from(input.state_root);
    let account = TrieAccount {
        nonce: input.account_nonce,
        balance: U256::from_be_bytes(input.account_balance),
        storage_root: B256::from(input.storage_hash),
        code_hash: B256::from(input.code_hash),
    };
    let account_rlp = rlp_encode(&account);
    let account_key = Nibbles::unpack(keccak256(input.escrow));
    let account_nodes: Vec<Bytes> = input.account_proof.iter().map(|n| Bytes::from(n.clone())).collect();
    verify_proof(state_root, account_key, Some(account_rlp), &account_nodes)
        .expect("account proof invalid");

    // 2. Storage proof: the slot holds `amount` (RLP of the trimmed integer) under storageRoot.
    let storage_root = B256::from(input.storage_hash);
    let slot_key = Nibbles::unpack(keccak256(input.amount_slot));
    let amount = U256::from(input.amount_wei);
    let value_rlp = rlp_encode(&amount);
    let storage_nodes: Vec<Bytes> = input.storage_proof.iter().map(|n| Bytes::from(n.clone())).collect();
    verify_proof(storage_root, slot_key, Some(value_rlp), &storage_nodes)
        .expect("storage proof invalid");

    // 3. The collateral clears the threshold. `amount` never leaves the guest.
    assert!(input.amount_wei >= input.threshold_wei, "amount below threshold");

    // 4. Nullifier = keccak256("veil-null" || escrow || hashlock). One lock -> one loan.
    let mut pre = Vec::with_capacity(NULL_TAG.len() + 20 + 32);
    pre.extend_from_slice(NULL_TAG);
    pre.extend_from_slice(&input.escrow);
    pre.extend_from_slice(&input.hashlock);
    let nullifier: [u8; 32] = keccak256(&pre).into();

    // 5. Commit the canonical 140-byte journal (the only public output).
    let journal = encode_journal(
        &input.state_root,
        input.block,
        &input.escrow,
        input.threshold_wei,
        &input.hashlock,
        &nullifier,
    );
    env::commit_slice(&journal);
}
