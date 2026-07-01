//! Poseidon2 incremental gating trees (repaid `R_sor` / liquidated `R_liq`) for veil-vault.
//!
//! The v3 replacement for vault-v2's SHA-256 `tree.rs`. Construction is byte-identical to the
//! `veil-pool` note tree and to the circom `MerkleProof(16)` the unlock/seize circuits fold: a node
//! is `poseidon2_compress(left, right)`, the empty-subtree siblings are `veil_pool::get_zeroes`, and
//! a leaf is `repaid_leaf`/`liquidated_leaf` (`DomainHash1(lock_handle, 0x32|0x33)`). So the root the
//! vault publishes after a repay/liquidation equals what the circuit computes for that leaf —
//! `rootRepaid`/`rootLiquidated` line up, and unlock/seize membership proofs verify.
//!
//! Two independent trees per vault, so this is a self-contained struct (not `veil-pool`'s
//! fixed-storage-key `MerkleTreeWithHistory`).

use soroban_sdk::{contracttype, Env, Vec, U256};
use veil_pool::notes::{liquidated_leaf as vp_liquidated_leaf, repaid_leaf as vp_repaid_leaf};
use veil_pool::poseidon2::{get_zeroes, poseidon2_compress};

/// Tree depth (matches the circom `MerkleProof(16)` + veil-pool note tree).
pub const DEPTH: u32 = 16;

#[contracttype]
#[derive(Clone)]
pub struct GatingTree {
    pub next_index: u32,
    pub filled: Vec<U256>, // filled subtrees, length DEPTH
    pub root: U256,        // current R_sor / R_liq
}

/// A fresh empty gating tree (root = `get_zeroes[DEPTH]`).
pub fn empty(env: &Env) -> GatingTree {
    let z = get_zeroes(env);
    let mut filled = Vec::new(env);
    for i in 0..DEPTH {
        filled.push_back(z.get(i).unwrap());
    }
    GatingTree { next_index: 0, filled, root: z.get(DEPTH).unwrap() }
}

/// `repaid_leaf(lock_handle)` = `DomainHash1(lock_handle, DS_REPAID 0x32)` — the leaf the vault
/// appends on repay; the unlock circuit proves its membership. Reuses the veil-pool note hash.
/// (Used by `repay` in unit 4; the cross-vector test exercises it now.)
#[allow(dead_code)]
pub fn repaid_leaf(env: &Env, lock_handle: &U256) -> U256 {
    vp_repaid_leaf(env, lock_handle)
}

/// `liquidated_leaf(lock_handle)` = `DomainHash1(lock_handle, DS_LIQUIDATED 0x33)` — appended on
/// liquidation; the seize circuit proves its membership.
#[allow(dead_code)]
pub fn liquidated_leaf(env: &Env, lock_handle: &U256) -> U256 {
    vp_liquidated_leaf(env, lock_handle)
}

/// Append `leaf` at the next index (Tornado incremental insert, folding from level 0 with
/// `poseidon2_compress`), recompute the path, and update `tree.root`. Identical fold to
/// `veil_pool::MerkleTreeWithHistory::insert_leaf` and the circom `MerkleProof`.
/// (Used by `repay`/`liquidate` in unit 4; the cross-vector test exercises it now.)
#[allow(dead_code)]
pub fn insert(env: &Env, tree: &mut GatingTree, leaf: U256) {
    let z = get_zeroes(env);
    let mut idx = tree.next_index;
    let mut cur = leaf;
    for i in 0..DEPTH {
        if idx % 2 == 0 {
            // left child; right sibling is the empty subtree at this level.
            tree.filled.set(i, cur.clone());
            cur = poseidon2_compress(env, cur.clone(), z.get(i).unwrap());
        } else {
            let left = tree.filled.get(i).unwrap();
            cur = poseidon2_compress(env, left, cur.clone());
        }
        idx /= 2;
    }
    tree.root = cur;
    tree.next_index += 1;
}
