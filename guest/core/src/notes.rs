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
/// Soroban repaid-tree leaf tag. The vault inserts `repaid_leaf(lockHandle)` on repay; the unlock
/// proof folds it to the Soroban repaid-root `R_sor` — the repay-proof that gates unlock.
pub const REPAID_TAG: &[u8] = b"VEIL_REPAID";

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

/// repaidLeaf = SHA256(REPAID_TAG ‖ lockHandle[32]). The leaf the Soroban vault appends when a
/// position is repaid; its membership in `R_sor` is the repay-proof the unlock guest requires.
pub fn repaid_leaf(lock_handle: &[u8; 32]) -> [u8; 32] {
    sha256(&[REPAID_TAG, lock_handle])
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

/// Lock joinsplit journal: `R(32) ‖ nullifier_in(32) ‖ commitment_out(32) ‖ lockId(32)`.
pub const LOCK_JOURNAL_LEN: usize = 128;

/// Canonical 128-byte lock journal (the public output of the lock joinsplit proof).
pub fn encode_lock_journal(
    root: &[u8; 32],
    nullifier_in: &[u8; 32],
    commitment_out: &[u8; 32],
    lock_id: &[u8; 32],
) -> [u8; LOCK_JOURNAL_LEN] {
    let mut out = [0u8; LOCK_JOURNAL_LEN];
    out[0..32].copy_from_slice(root);
    out[32..64].copy_from_slice(nullifier_in);
    out[64..96].copy_from_slice(commitment_out);
    out[96..128].copy_from_slice(lock_id);
    out
}

/// Lock joinsplit witness: spend one AVAILABLE note and mint one LOCKED note of the SAME hidden
/// amount. Public fields are re-committed to the journal; the rest stay secret.
#[derive(Clone, Serialize, Deserialize)]
pub struct LockInput {
    // --- public (re-committed) ---
    pub root: [u8; 32],
    pub nullifier_in: [u8; 32],
    pub commitment_out: [u8; 32],
    pub lock_id: [u8; 32],
    // --- private witnesses ---
    pub amount: u128,
    pub blinding_in: [u8; 32],
    pub spend_pk: [u8; 32],
    pub nk: [u8; 32],
    pub leaf_index: u64,
    pub siblings: Vec<[u8; 32]>,
    pub blinding_out: [u8; 32],
}

/// The complete lock-joinsplit logic as a pure function: prove ownership of an AVAILABLE note in
/// `root`, publish its nullifier, and mint a LOCKED note of the SAME amount bound to `lock_id`.
/// Value is conserved structurally — the single private `amount` feeds both commitments, so the
/// proof cannot mint a LOCKED note worth more (or less) than the spent AVAILABLE note. Panics
/// (→ proof fails) on any violation. `amount` never appears in the output.
///
/// This is a 1-input/1-output joinsplit: it locks the ENTIRE AVAILABLE note (no change output).
/// Partial locking would need a second output note; out of scope for the MVP.
pub fn verify_lock(input: &LockInput) -> [u8; LOCK_JOURNAL_LEN] {
    // 1. Recompute the AVAILABLE input note (aux = 0).
    let c_in = note_commitment(
        DOMAIN_AVAILABLE,
        input.amount,
        &input.blinding_in,
        &input.spend_pk,
        &[0u8; 32],
    );

    // 2. The input note is a member of the committed root.
    let computed_root = merkle_root_from_path(&c_in, input.leaf_index, &input.siblings);
    assert!(computed_root == input.root, "input note not in pool");

    // 3. The published nullifier is the correct key-derived nullifier (proves nk ownership).
    let nf = nullifier(&input.nk, &c_in, input.leaf_index);
    assert!(nf == input.nullifier_in, "bad nullifier");

    // 4. The LOCKED output note carries the SAME amount (value conserved) and binds `lock_id`.
    let c_out = note_commitment(
        DOMAIN_LOCKED,
        input.amount,
        &input.blinding_out,
        &input.spend_pk,
        &input.lock_id,
    );
    assert!(c_out == input.commitment_out, "bad output commitment");

    encode_lock_journal(&input.root, &nf, &c_out, &input.lock_id)
}

/// Unlock joinsplit journal: `R_eth(32) ‖ R_sor(32) ‖ nullifier_in(32) ‖ commitment_out(32)`.
/// `lockId` is deliberately NOT published — its binding is enforced inside the guest (the spent
/// LOCKED note commits it, and `repaid_leaf(lock_handle(lockId))` must be in `R_sor`), so the
/// public unlock event carries no explicit link back to the lock beyond what timing already leaks.
pub const UNLOCK_JOURNAL_LEN: usize = 128;

/// Canonical 128-byte unlock journal (the public output of the unlock joinsplit proof).
pub fn encode_unlock_journal(
    root_eth: &[u8; 32],
    root_sor: &[u8; 32],
    nullifier_in: &[u8; 32],
    commitment_out: &[u8; 32],
) -> [u8; UNLOCK_JOURNAL_LEN] {
    let mut out = [0u8; UNLOCK_JOURNAL_LEN];
    out[0..32].copy_from_slice(root_eth);
    out[32..64].copy_from_slice(root_sor);
    out[64..96].copy_from_slice(nullifier_in);
    out[96..128].copy_from_slice(commitment_out);
    out
}

/// Unlock joinsplit witness: spend one LOCKED note and mint one AVAILABLE note of the SAME hidden
/// amount — but ONLY against a proof that the loan tied to this lock was repaid on Stellar.
#[derive(Clone, Serialize, Deserialize)]
pub struct UnlockInput {
    // --- public (re-committed) ---
    pub root_eth: [u8; 32],
    pub root_sor: [u8; 32],
    pub nullifier_in: [u8; 32],
    pub commitment_out: [u8; 32],
    // --- private witnesses ---
    pub amount: u128,
    pub blinding_in: [u8; 32],
    pub spend_pk: [u8; 32],
    pub nk: [u8; 32],
    pub lock_id: [u8; 32],
    pub leaf_index: u64,
    pub siblings_eth: Vec<[u8; 32]>,
    pub blinding_out: [u8; 32],
    pub repaid_leaf_index: u64,
    pub siblings_sor: Vec<[u8; 32]>,
}

/// The complete unlock-guest logic as a pure function. Reverse of `verify_lock`: prove ownership of
/// a LOCKED note in the Ethereum pool root, prove (THE INVARIANT) that the position tied to its
/// `lock_id` was REPAID on Stellar — `repaid_leaf(lock_handle(lock_id))` is a member of the Soroban
/// repaid-root `R_sor` — then publish the LOCKED note's nullifier and mint an AVAILABLE note of the
/// SAME amount. Value is conserved structurally (one private `amount` feeds both commitments) and
/// the repay-proof is non-optional, so a borrower can never recover spendable collateral without
/// repaying (the v1 "keep loan + collateral" hole is closed). Panics (→ proof fails) on violation.
pub fn verify_unlock(input: &UnlockInput) -> [u8; UNLOCK_JOURNAL_LEN] {
    // 1. Recompute the LOCKED input note (aux = lock_id).
    let c_in = note_commitment(
        DOMAIN_LOCKED,
        input.amount,
        &input.blinding_in,
        &input.spend_pk,
        &input.lock_id,
    );

    // 2. The LOCKED note is a member of the Ethereum pool root.
    let computed_eth = merkle_root_from_path(&c_in, input.leaf_index, &input.siblings_eth);
    assert!(computed_eth == input.root_eth, "locked note not in pool");

    // 3. The published nullifier is the correct key-derived nullifier (proves nk ownership).
    let nf = nullifier(&input.nk, &c_in, input.leaf_index);
    assert!(nf == input.nullifier_in, "bad nullifier");

    // 4. THE REPAY-PROOF: the repaid leaf for THIS lock is a member of the Soroban repaid-root.
    //    repaid_leaf binds to lock_handle(lock_id), the SAME lock_id the spent LOCKED note commits.
    let rl = repaid_leaf(&lock_handle(&input.lock_id));
    let computed_sor = merkle_root_from_path(&rl, input.repaid_leaf_index, &input.siblings_sor);
    assert!(computed_sor == input.root_sor, "position not repaid on Stellar");

    // 5. Mint an AVAILABLE note of the SAME amount (value conserved), aux = 0.
    let c_out = note_commitment(
        DOMAIN_AVAILABLE,
        input.amount,
        &input.blinding_out,
        &input.spend_pk,
        &[0u8; 32],
    );
    assert!(c_out == input.commitment_out, "bad output commitment");

    encode_unlock_journal(&input.root_eth, &input.root_sor, &nf, &c_out)
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

    // ---- lock joinsplit ----

    fn build_lock_input(amount: u128) -> LockInput {
        let blinding_in = fill(0x0A);
        let spend_pk = fill(0x0B);
        let nk = fill(0x0C);
        let lock_id = fill(0x0D);
        let blinding_out = fill(0x0E);

        // AVAILABLE note at leaf 0 of a depth-2 empty tree.
        let c_in = note_commitment(DOMAIN_AVAILABLE, amount, &blinding_in, &spend_pk, &[0u8; 32]);
        let siblings = vec![Z0, z1()];
        let root = merkle_root_from_path(&c_in, 0, &siblings);
        let nf = nullifier(&nk, &c_in, 0);
        let c_out = note_commitment(DOMAIN_LOCKED, amount, &blinding_out, &spend_pk, &lock_id);

        LockInput {
            root,
            nullifier_in: nf,
            commitment_out: c_out,
            lock_id,
            amount,
            blinding_in,
            spend_pk,
            nk,
            leaf_index: 0,
            siblings,
            blinding_out,
        }
    }

    #[test]
    fn verify_lock_happy_path() {
        let amount = 3_000_000_000_000_000_000u128;
        let input = build_lock_input(amount);
        let journal = verify_lock(&input);
        let expected = encode_lock_journal(
            &input.root,
            &input.nullifier_in,
            &input.commitment_out,
            &input.lock_id,
        );
        assert_eq!(journal, expected);
        // amount stays private.
        assert!(!journal.windows(16).any(|w| w == amount.to_be_bytes()), "amount leaked");
    }

    #[test]
    #[should_panic(expected = "input note not in pool")]
    fn verify_lock_rejects_wrong_membership() {
        let mut input = build_lock_input(1_000);
        input.siblings[0] = fill(0xFF); // break the path
        verify_lock(&input);
    }

    #[test]
    #[should_panic(expected = "bad nullifier")]
    fn verify_lock_rejects_wrong_nk() {
        let mut input = build_lock_input(1_000);
        input.nk = fill(0x99); // nullifier no longer matches the published one
        verify_lock(&input);
    }

    #[test]
    #[should_panic(expected = "bad output commitment")]
    fn verify_lock_rejects_value_inflation() {
        // Claim a LOCKED output worth MORE than the spent note: recompute commitment_out for a
        // bigger amount but keep the real (smaller) spent amount. The bound output won't match.
        let mut input = build_lock_input(1_000);
        input.commitment_out = note_commitment(
            DOMAIN_LOCKED,
            9_999_999, // inflated
            &input.blinding_out,
            &input.spend_pk,
            &input.lock_id,
        );
        verify_lock(&input);
    }

    #[test]
    fn lock_journal_layout_is_fixed() {
        let r = fill(0x1A);
        let nf = fill(0x2B);
        let co = fill(0x3C);
        let lid = fill(0x4D);
        let j = encode_lock_journal(&r, &nf, &co, &lid);
        assert_eq!(j.len(), LOCK_JOURNAL_LEN);
        assert_eq!(&j[0..32], &r);
        assert_eq!(&j[32..64], &nf);
        assert_eq!(&j[64..96], &co);
        assert_eq!(&j[96..128], &lid);
    }

    // ---- unlock joinsplit (item 7: spend LOCKED -> mint AVAILABLE, gated on a Stellar repay-proof) ----

    fn build_unlock_input(amount: u128) -> UnlockInput {
        let blinding_in = fill(0x1A);
        let spend_pk = fill(0x1B);
        let nk = fill(0x1C);
        let lock_id = fill(0x1D);
        let blinding_out = fill(0x1E);

        // LOCKED note at leaf 0 of a depth-2 empty Ethereum pool tree.
        let c_in = note_commitment(DOMAIN_LOCKED, amount, &blinding_in, &spend_pk, &lock_id);
        let siblings_eth = vec![Z0, z1()];
        let root_eth = merkle_root_from_path(&c_in, 0, &siblings_eth);
        let nf = nullifier(&nk, &c_in, 0);

        // Soroban repaid-tree: repaidLeaf(lockHandle) at leaf 0 of a depth-2 empty tree.
        let lh = lock_handle(&lock_id);
        let rl = repaid_leaf(&lh);
        let siblings_sor = vec![Z0, z1()];
        let root_sor = merkle_root_from_path(&rl, 0, &siblings_sor);

        // AVAILABLE output note of the SAME amount (aux = 0).
        let c_out = note_commitment(DOMAIN_AVAILABLE, amount, &blinding_out, &spend_pk, &[0u8; 32]);

        UnlockInput {
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
            siblings_eth,
            blinding_out,
            repaid_leaf_index: 0,
            siblings_sor,
        }
    }

    #[test]
    fn verify_unlock_happy_path() {
        let amount = 4_000_000_000_000_000_000u128;
        let input = build_unlock_input(amount);
        let journal = verify_unlock(&input);
        let expected = encode_unlock_journal(
            &input.root_eth,
            &input.root_sor,
            &input.nullifier_in,
            &input.commitment_out,
        );
        assert_eq!(journal, expected);
        assert!(!journal.windows(16).any(|w| w == amount.to_be_bytes()), "amount leaked");
    }

    #[test]
    #[should_panic(expected = "locked note not in pool")]
    fn verify_unlock_rejects_wrong_eth_membership() {
        let mut input = build_unlock_input(1_000);
        input.siblings_eth[0] = fill(0xFF);
        verify_unlock(&input);
    }

    #[test]
    #[should_panic(expected = "bad nullifier")]
    fn verify_unlock_rejects_wrong_nk() {
        let mut input = build_unlock_input(1_000);
        input.nk = fill(0x99);
        verify_unlock(&input);
    }

    #[test]
    #[should_panic(expected = "position not repaid on Stellar")]
    fn verify_unlock_rejects_unrepaid_position() {
        // THE INVARIANT: without a valid repaidLeaf membership in R_sor, unlock fails — you cannot
        // recover spendable collateral unless repay() ran on Stellar. Break the Soroban path.
        let mut input = build_unlock_input(1_000);
        input.siblings_sor[0] = fill(0xEE);
        verify_unlock(&input);
    }

    #[test]
    #[should_panic(expected = "bad output commitment")]
    fn verify_unlock_rejects_value_inflation() {
        let mut input = build_unlock_input(1_000);
        input.commitment_out = note_commitment(
            DOMAIN_AVAILABLE,
            9_999_999, // mint more than was locked
            &input.blinding_out,
            &input.spend_pk,
            &[0u8; 32],
        );
        verify_unlock(&input);
    }

    #[test]
    fn unlock_journal_layout_is_fixed() {
        let re = fill(0x5A);
        let rs = fill(0x6B);
        let nf = fill(0x7C);
        let co = fill(0x8D);
        let j = encode_unlock_journal(&re, &rs, &nf, &co);
        assert_eq!(j.len(), UNLOCK_JOURNAL_LEN);
        assert_eq!(&j[0..32], &re);
        assert_eq!(&j[32..64], &rs);
        assert_eq!(&j[64..96], &nf);
        assert_eq!(&j[96..128], &co);
    }

    #[test]
    fn repaid_leaf_is_domain_separated() {
        let lh = fill(0x77);
        // repaid leaf must not collide with the lock-handle it commits, nor with a raw note hash.
        assert_ne!(repaid_leaf(&lh), lh);
        assert_eq!(repaid_leaf(&lh), repaid_leaf(&lh)); // deterministic
    }

    #[test]
    fn repaid_tree_matches_cross_impl_vector() {
        // CROSS-IMPL VECTOR for the Soroban repaid-tree (R_sor). The depth-2 first-leaf root of
        // repaid_leaf(lock_handle(lockId=0x02..02)) is asserted identically in vault-v2's
        // `repaid_root_matches_cross_impl_vector`. If the guest fold and the Soroban incremental
        // tree ever diverge, one of the two assertions breaks (unlock proofs would silently fail).
        let lock_id = fill(0x02);
        let rl = repaid_leaf(&lock_handle(&lock_id));
        let root = merkle_root_from_path(&rl, 0, &[Z0, z1()]);
        let pinned = hex_lit("078c403cbcb728559874cdc1be85abdf3396b2c047c1e11c624e38a22374d8eb");
        assert_eq!(&root[..], &pinned[..], "repaid-tree root drifted from the shared vector");

        // Same vector at the PRODUCTION depth (16): the repaid-tree root after inserting this leaf
        // at index 0 of an empty depth-16 tree. Asserted identically in vault-v2 after one repay.
        let root16 = merkle_root_from_path(&rl, 0, &zero_hashes(16));
        let pinned16 = hex_lit("c560d2cefe358de23b6e70b7a5293e9d1926cbe6f40cc24df23eb10cd7f2df8e");
        assert_eq!(&root16[..], &pinned16[..], "depth-16 repaid-tree root drifted");
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
