//! Veil v2 shielded-note cryptography (shared by the RISC Zero borrow guest, the host,
//! and — via identical constants — the off-chain note client and `VeilPool.sol`).
//!
//! Everything here is **SHA-256** so the RISC Zero zkVM accelerator makes Merkle membership
//! cheap. The Merkle fold MUST stay byte-identical to `contracts/escrow/src/MerkleTreeWithHistory.sol`
//! (`sha256(left ‖ right)`, zero leaf = bytes32(0), ordering by leaf-index bit) or proofs
//! produced here will not verify against on-chain roots.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Domain-separation tags. Changing any of these is a breaking change to the note format.
pub const NOTE_TAG: &[u8] = b"VEIL_NOTE";
pub const NF_TAG: &[u8] = b"VEIL_NF";
pub const POS_TAG: &[u8] = b"VEIL_POS";
pub const LOCK_TAG: &[u8] = b"VEIL_LOCK";

/// Note domains.
pub const DOMAIN_AVAILABLE: u8 = 0x00;
pub const DOMAIN_LOCKED: u8 = 0x01;

/// Borrow journal: `R(32) ‖ T(16 BE) ‖ position_id(32) ‖ lockHandle(32) ‖ borrower(32)`.
/// `borrower` (a hash of the borrower's Stellar strkey) binds the proof to one account so a
/// stolen `{seal, journal}` cannot be replayed by a thief to open the loan elsewhere — the
/// vault asserts `journal.borrower == hash(invoker)`. (Same defense as v1's `recipient`.)
pub const BORROW_JOURNAL_LEN: usize = 144;

fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

/// Hash two 32-byte words as an internal Merkle node: `sha256(left ‖ right)`.
pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    sha256(&[left, right])
}

/// Note commitment:
///   C = SHA256(NOTE_TAG ‖ domain[1] ‖ amount[16 BE] ‖ blinding[32] ‖ spendPk[32] ‖ aux[32])
/// `aux` carries the `lockId` for LOCKED notes (binding the note to its on-chain lock) and is
/// zero for AVAILABLE notes.
pub fn note_commitment(
    domain: u8,
    amount: u128,
    blinding: &[u8; 32],
    spend_pk: &[u8; 32],
    aux: &[u8; 32],
) -> [u8; 32] {
    sha256(&[NOTE_TAG, &[domain], &amount.to_be_bytes(), blinding, spend_pk, aux])
}

/// Key-derived, Penumbra-style nullifier (unlinkable without the nullifier key `nk`):
///   nf = SHA256(NF_TAG ‖ nk[32] ‖ C[32] ‖ leafIndex[8 BE])
pub fn nullifier(nk: &[u8; 32], commitment: &[u8; 32], leaf_index: u64) -> [u8; 32] {
    sha256(&[NF_TAG, nk, commitment, &leaf_index.to_be_bytes()])
}

/// position_id = SHA256(POS_TAG ‖ loanSecret[32]). Public loan identity bound to a borrower secret.
pub fn position_id(loan_secret: &[u8; 32]) -> [u8; 32] {
    sha256(&[POS_TAG, loan_secret])
}

/// lockHandle = SHA256(LOCK_TAG ‖ lockId[32]). Ties the loan to one specific on-chain lock.
pub fn lock_handle(lock_id: &[u8; 32]) -> [u8; 32] {
    sha256(&[LOCK_TAG, lock_id])
}

/// Fold a leaf up its Merkle path to a root, ordering siblings by the leaf-index bit at each
/// level — identical to `MerkleTreeWithHistory._insert`. `siblings.len()` is the tree depth.
pub fn merkle_root_from_path(leaf: &[u8; 32], leaf_index: u64, siblings: &[[u8; 32]]) -> [u8; 32] {
    let mut cur = *leaf;
    for (i, sib) in siblings.iter().enumerate() {
        let bit = (leaf_index >> i) & 1;
        cur = if bit == 0 {
            hash_pair(&cur, sib) // we are the left child
        } else {
            hash_pair(sib, &cur) // we are the right child
        };
    }
    cur
}

/// The all-zero subtree roots `zeros[0..depth]` (zeros[0] = bytes32(0),
/// zeros[i] = sha256(zeros[i-1] ‖ zeros[i-1])). For a note at leaf index 0 in an otherwise
/// empty tree, `zeros[level]` is exactly the sibling at each level — so this doubles as the
/// Merkle path of the first note. Used by the host and the off-chain note client.
pub fn zero_hashes(depth: usize) -> Vec<[u8; 32]> {
    let mut out = Vec::with_capacity(depth);
    let mut cur = [0u8; 32];
    for _ in 0..depth {
        out.push(cur);
        cur = hash_pair(&cur, &cur);
    }
    out
}

/// Canonical 144-byte borrow journal (the only public output of the borrow proof).
pub fn encode_borrow_journal(
    root: &[u8; 32],
    threshold: u128,
    position_id: &[u8; 32],
    lock_handle: &[u8; 32],
    borrower: &[u8; 32],
) -> [u8; BORROW_JOURNAL_LEN] {
    let mut out = [0u8; BORROW_JOURNAL_LEN];
    out[0..32].copy_from_slice(root);
    out[32..48].copy_from_slice(&threshold.to_be_bytes());
    out[48..80].copy_from_slice(position_id);
    out[80..112].copy_from_slice(lock_handle);
    out[112..144].copy_from_slice(borrower);
    out
}

/// Borrow proof witness. Public fields are re-committed to the journal; the rest stay secret
/// (notably `amount` — the value the whole proof exists to hide).
#[derive(Clone, Serialize, Deserialize)]
pub struct BorrowInput {
    // --- public (re-committed) ---
    pub root: [u8; 32],
    pub threshold: u128,
    // --- private witnesses ---
    pub amount: u128,
    pub blinding: [u8; 32],
    pub spend_pk: [u8; 32],
    pub lock_id: [u8; 32],
    pub leaf_index: u64,
    pub siblings: Vec<[u8; 32]>,
    pub loan_secret: [u8; 32],
    /// Public binding to the borrower's Stellar account (hash of strkey). Committed to the
    /// journal so a stolen proof cannot be redeemed by a different caller.
    pub borrower: [u8; 32],
}

/// The complete borrow-guest logic as a pure function: prove a LOCKED note with
/// `amount >= threshold` is a member of `root`, bind the position and lock, and return the
/// journal. Panics (→ proof fails) on any violation. `amount` never appears in the output.
pub fn verify_borrow(input: &BorrowInput) -> [u8; BORROW_JOURNAL_LEN] {
    // 1. Recompute the LOCKED note commitment from the private opening.
    let commitment = note_commitment(
        DOMAIN_LOCKED,
        input.amount,
        &input.blinding,
        &input.spend_pk,
        &input.lock_id,
    );

    // 2. The note is a member of the committed root.
    let computed_root = merkle_root_from_path(&commitment, input.leaf_index, &input.siblings);
    assert!(computed_root == input.root, "note not in pool");

    // 3. The hidden amount clears the public threshold.
    assert!(input.amount >= input.threshold, "amount below threshold");

    // 4. Bind the position and the lock; lockHandle shares `lock_id` with the proven note.
    let pid = position_id(&input.loan_secret);
    let lh = lock_handle(&input.lock_id);

    // 5. `borrower` is a pass-through public binding (no secret) the vault checks against the
    //    invoker, so a stolen {seal, journal} cannot open the loan from another account.
    encode_borrow_journal(&input.root, input.threshold, &pid, &lh, &input.borrower)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Canonical SHA-256 all-zero subtree roots (eth2 deposit `zerohashes`) — external ground
    // truth shared with the Solidity tree's `test_ZeroHashesMatchSha256Standard`.
    const Z0: [u8; 32] = [0u8; 32];
    fn z1() -> [u8; 32] {
        let mut a = [0u8; 32];
        a.copy_from_slice(
            &hex_lit("f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b"),
        );
        a
    }

    fn hex_lit(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    fn fill(b: u8) -> [u8; 32] {
        [b; 32]
    }

    #[test]
    fn note_commitment_matches_manual_sha256() {
        let blinding = fill(0x11);
        let spend_pk = fill(0x22);
        let aux = fill(0x33);
        let amount: u128 = 1_500_000_000_000_000_000; // 1.5 wstETH-units

        let got = note_commitment(DOMAIN_LOCKED, amount, &blinding, &spend_pk, &aux);

        let mut h = Sha256::new();
        h.update(b"VEIL_NOTE");
        h.update([DOMAIN_LOCKED]);
        h.update(amount.to_be_bytes());
        h.update(blinding);
        h.update(spend_pk);
        h.update(aux);
        let want: [u8; 32] = h.finalize().into();
        assert_eq!(got, want);
    }

    #[test]
    fn merkle_fold_orders_by_index_bit() {
        let leaf = fill(0xAA);
        let sib = fill(0xBB);
        // index 0 → left child → hash(leaf, sib)
        assert_eq!(merkle_root_from_path(&leaf, 0, &[sib]), hash_pair(&leaf, &sib));
        // index 1 → right child → hash(sib, leaf)
        assert_eq!(merkle_root_from_path(&leaf, 1, &[sib]), hash_pair(&sib, &leaf));
    }

    #[test]
    fn merkle_root_matches_canonical_empty_siblings() {
        // depth-2 tree, single leaf at index 0, empty-tree siblings [z0, z1]:
        // root = hash(hash(leaf, z0), z1). Same construction the Solidity tree uses.
        let leaf = fill(0xCD);
        let root = merkle_root_from_path(&leaf, 0, &[Z0, z1()]);
        let expected = hash_pair(&hash_pair(&leaf, &Z0), &z1());
        assert_eq!(root, expected);

        // CROSS-IMPL VECTOR: this exact literal is also asserted in the Solidity tree's
        // `test_CrossImplRootVector` (contracts/escrow/test/VeilPool.t.sol). If guest and
        // contract ever diverge, one of the two assertions breaks.
        let pinned = hex_lit("e7a935fd4370e33243b4b66fe104dbee170db86603e4a0845d6bb491d0187a44");
        assert_eq!(&root[..], &pinned[..], "guest root drifted from the shared cross-impl vector");
    }

    #[test]
    fn position_and_lock_bindings_are_deterministic_and_distinct() {
        let s = fill(0x44);
        assert_eq!(position_id(&s), position_id(&s), "deterministic");
        // position and lock domains must not collide for the same 32-byte input.
        assert_ne!(position_id(&s), lock_handle(&s), "domain-separated");
    }

    #[test]
    fn verify_borrow_happy_path_returns_expected_journal() {
        let amount: u128 = 2_000_000_000_000_000_000;
        let threshold: u128 = 1_000_000_000_000_000_000;
        let blinding = fill(0x01);
        let spend_pk = fill(0x02);
        let lock_id = fill(0x03);
        let loan_secret = fill(0x04);
        let borrower = fill(0x05);

        // Build a depth-2 tree with the note at index 0 and empty-tree siblings.
        let commitment = note_commitment(DOMAIN_LOCKED, amount, &blinding, &spend_pk, &lock_id);
        let siblings = vec![Z0, z1()];
        let root = merkle_root_from_path(&commitment, 0, &siblings);

        let input = BorrowInput {
            root,
            threshold,
            amount,
            blinding,
            spend_pk,
            lock_id,
            leaf_index: 0,
            siblings,
            loan_secret,
            borrower,
        };

        let journal = verify_borrow(&input);
        let expected = encode_borrow_journal(
            &root,
            threshold,
            &position_id(&loan_secret),
            &lock_handle(&lock_id),
            &borrower,
        );
        assert_eq!(journal, expected);
        // The borrower binding is present in the journal (anti-replay).
        assert_eq!(&journal[112..144], &borrower, "borrower bound");
        // The hidden amount must never appear in the public journal.
        assert!(!journal.windows(16).any(|w| w == amount.to_be_bytes()), "amount leaked");
    }

    #[test]
    #[should_panic(expected = "amount below threshold")]
    fn verify_borrow_rejects_below_threshold() {
        let amount: u128 = 500;
        let threshold: u128 = 1_000;
        let blinding = fill(0x01);
        let spend_pk = fill(0x02);
        let lock_id = fill(0x03);
        let commitment = note_commitment(DOMAIN_LOCKED, amount, &blinding, &spend_pk, &lock_id);
        let siblings = vec![Z0, z1()];
        let root = merkle_root_from_path(&commitment, 0, &siblings);
        let input = BorrowInput {
            root,
            threshold,
            amount,
            blinding,
            spend_pk,
            lock_id,
            leaf_index: 0,
            siblings,
            loan_secret: fill(0x04),
            borrower: fill(0x05),
        };
        verify_borrow(&input);
    }

    #[test]
    #[should_panic(expected = "note not in pool")]
    fn verify_borrow_rejects_wrong_membership() {
        let amount: u128 = 2_000;
        let threshold: u128 = 1_000;
        let blinding = fill(0x01);
        let spend_pk = fill(0x02);
        let lock_id = fill(0x03);
        let commitment = note_commitment(DOMAIN_LOCKED, amount, &blinding, &spend_pk, &lock_id);
        let mut siblings = vec![Z0, z1()];
        let root = merkle_root_from_path(&commitment, 0, &siblings);
        // Tamper a sibling so the fold no longer reaches `root`.
        siblings[0] = fill(0xFF);
        let input = BorrowInput {
            root,
            threshold,
            amount,
            blinding,
            spend_pk,
            lock_id,
            leaf_index: 0,
            siblings,
            loan_secret: fill(0x04),
            borrower: fill(0x05),
        };
        verify_borrow(&input);
    }

    #[test]
    fn zero_hashes_match_canonical_vectors() {
        let z = zero_hashes(4);
        assert_eq!(z.len(), 4);
        assert_eq!(z[0], Z0);
        assert_eq!(z[1], z1());
        // A first-note Merkle path in a depth-d empty tree is exactly these zero hashes.
        let leaf = fill(0xEE);
        let depth = 8;
        let sibs = zero_hashes(depth);
        let root = merkle_root_from_path(&leaf, 0, &sibs);
        // Fold by hand to confirm `zero_hashes` is a valid path.
        let mut expected = leaf;
        for s in &sibs {
            expected = hash_pair(&expected, s);
        }
        assert_eq!(root, expected);
    }

    #[test]
    fn borrow_journal_layout_is_fixed() {
        let root = fill(0xA1);
        let pid = fill(0xB2);
        let lh = fill(0xC3);
        let borrower = fill(0xD4);
        let t: u128 = 0x0102_0304_0506_0708_090A_0B0C_0D0E_0F10;
        let j = encode_borrow_journal(&root, t, &pid, &lh, &borrower);
        assert_eq!(j.len(), BORROW_JOURNAL_LEN);
        assert_eq!(&j[0..32], &root);
        assert_eq!(&j[32..48], &t.to_be_bytes());
        assert_eq!(&j[48..80], &pid);
        assert_eq!(&j[80..112], &lh);
        assert_eq!(&j[112..144], &borrower);
    }
}
