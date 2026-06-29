//! Soroban incremental SHA-256 Merkle tree for the repaid-position set (`R_sor`).
//!
//! Construction is byte-identical to `contracts/escrow/src/MerkleTreeWithHistory.sol` and to the
//! guest's `veil_core::notes::merkle_root_from_path`: a node is `sha256(left ‖ right)`, the zero
//! leaf is `[0;32]`, and `zeros[i] = sha256(zeros[i-1] ‖ zeros[i-1])`. One `repaid_leaf` is
//! appended per `repay`, and the resulting root is `R_sor` — the value Relayer B posts to Ethereum
//! and the unlock guest proves membership against (the repay-proof that gates collateral recovery).
//!
//! Cross-impl vectors (depth 2 and depth 16) are pinned in BOTH this crate's tests and
//! `guest/core/src/notes.rs` so the Soroban tree and the guest fold can never silently diverge.
use soroban_sdk::{contracttype, Bytes, BytesN, Env, Vec};

/// Repaid-tree depth (≤ 65_536 repaid positions — ample for the build).
pub const REPAID_DEPTH: u32 = 16;
/// Domain tag for a repaid leaf; matches `veil_core::notes::REPAID_TAG`.
const REPAID_TAG: &[u8] = b"VEIL_REPAID";

#[contracttype]
#[derive(Clone)]
pub struct RepaidTree {
    pub next_index: u32,
    pub filled: Vec<BytesN<32>>, // filled subtrees, length REPAID_DEPTH
    pub root: BytesN<32>,        // current R_sor
}

fn hash_pair(env: &Env, l: &BytesN<32>, r: &BytesN<32>) -> BytesN<32> {
    let mut b = Bytes::new(env);
    b.append(&Bytes::from_array(env, &l.to_array()));
    b.append(&Bytes::from_array(env, &r.to_array()));
    env.crypto().sha256(&b).into()
}

/// `zeros[0..=REPAID_DEPTH]`: the all-zero subtree roots at each height.
fn zeros(env: &Env) -> Vec<BytesN<32>> {
    let mut v = Vec::new(env);
    let mut cur = BytesN::from_array(env, &[0u8; 32]);
    v.push_back(cur.clone());
    for _ in 0..REPAID_DEPTH {
        cur = hash_pair(env, &cur, &cur);
        v.push_back(cur.clone());
    }
    v
}

/// A fresh empty repaid-tree (root = `zeros[REPAID_DEPTH]`).
pub fn empty(env: &Env) -> RepaidTree {
    let z = zeros(env);
    let mut filled = Vec::new(env);
    for i in 0..REPAID_DEPTH {
        filled.push_back(z.get(i).unwrap());
    }
    RepaidTree { next_index: 0, filled, root: z.get(REPAID_DEPTH).unwrap() }
}

/// `repaidLeaf = sha256(REPAID_TAG ‖ lock_handle)` — matches `veil_core::notes::repaid_leaf`.
pub fn repaid_leaf(env: &Env, lock_handle: &BytesN<32>) -> BytesN<32> {
    let mut b = Bytes::new(env);
    b.append(&Bytes::from_slice(env, REPAID_TAG));
    b.append(&Bytes::from_array(env, &lock_handle.to_array()));
    env.crypto().sha256(&b).into()
}

/// Append `leaf` at the next index, recompute the path to the root (Tornado-style incremental
/// insert — identical to `MerkleTreeWithHistory._insert`), and update `tree.root` (the new R_sor).
pub fn insert(env: &Env, tree: &mut RepaidTree, leaf: BytesN<32>) {
    let z = zeros(env);
    let mut idx = tree.next_index;
    let mut cur = leaf;
    for i in 0..REPAID_DEPTH {
        if idx % 2 == 0 {
            // left child; the right sibling is the empty subtree at this level.
            tree.filled.set(i, cur.clone());
            cur = hash_pair(env, &cur, &z.get(i).unwrap());
        } else {
            let left = tree.filled.get(i).unwrap();
            cur = hash_pair(env, &left, &cur);
        }
        idx /= 2;
    }
    tree.root = cur;
    tree.next_index += 1;
}
