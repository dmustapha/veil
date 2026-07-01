pragma circom 2.2.2;

include "note_commitment.circom";
include "merkle_proof.circom";
include "domain_hash.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Veil v3 BORROW joinsplit — client-side-provable port of guest/core/src/notes.rs::verify_borrow.
//
// Proves: "I own a LOCKED note of hidden amount >= the public threshold that is a member of the pool
// root" — binding the loan to a position id, a lock handle, and the borrower's account, without ever
// revealing the amount. The vault (Phase 4) verifies this Groth16 proof, checks `root` is a known
// pool root, and binds `borrower` to the invoker (anti-replay).
//
//   Private: amount, blinding, spendPk, lockId, leafIndex, pathElements[levels], loanSecret
//   Public signals in SNARKJS ORDER (outputs first, then declared public inputs) — the order the
//   verifier's IC expects and the vault MUST pass:
//     [0]=positionId  [1]=lockHandle  [2]=root  [3]=threshold  [4]=borrower   (nPublic = 5)
template Borrow(levels) {
    // --- public ---
    signal input root;
    signal input threshold;
    signal input borrower;   // hash of the borrower's Stellar account; anti-replay pass-through
    // --- private ---
    signal input amount;
    signal input blinding;
    signal input spendPk;
    signal input lockId;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input loanSecret;
    // --- public outputs ---
    signal output positionId;
    signal output lockHandle;

    // Range-bound the u128 amounts BEFORE comparing — GreaterEqThan does not range-check its inputs,
    // so without this a malicious prover could pick amount/threshold outside [0, 2^128) and break the
    // comparison. (amount is further pinned to a real deposited note by the membership check below.)
    component amountBits = Num2Bits(128);
    amountBits.in <== amount;
    component thresholdBits = Num2Bits(128);
    thresholdBits.in <== threshold;

    // 1. Recompute the LOCKED note commitment (aux = lockId).
    component note = NoteCommitment();
    note.domainSep <== 17; // DS_NOTE_LOCKED (0x11)
    note.amount    <== amount;
    note.spendPk   <== spendPk;
    note.blinding  <== blinding;
    note.aux       <== lockId;

    // 2. Membership: the note is in the committed pool root.
    component mp = MerkleProof(levels);
    mp.leaf <== note.out;
    mp.pathElements <== pathElements;
    mp.pathIndices <== leafIndex;
    mp.root === root;

    // 3. The hidden amount clears the public threshold.
    component ge = GreaterEqThan(128);
    ge.in[0] <== amount;
    ge.in[1] <== threshold;
    ge.out === 1;

    // 4. Bind the position (from the loan secret) and the lock (from lockId).
    component pid = DomainHash1();
    pid.x <== loanSecret;
    pid.domainSep <== 48; // DS_POS (0x30)
    positionId <== pid.out;

    component lh = DomainHash1();
    lh.x <== lockId;
    lh.domainSep <== 49; // DS_LOCK (0x31)
    lockHandle <== lh.out;

    // 5. Bind `borrower` into the constraint system so it can't be malleated (tornado pass-through
    //    pattern): a stolen proof can't be redeemed from a different account.
    signal borrowerBound;
    borrowerBound <== borrower * borrower;
}
