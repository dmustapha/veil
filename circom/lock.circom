pragma circom 2.2.2;

include "note_commitment.circom";
include "merkle_proof.circom";
include "nullifier.circom";
include "domain_hash.circom";
include "circomlib/circuits/bitify.circom";

// Veil v3 LOCK joinsplit — client-side-provable port of guest/core/src/notes.rs::verify_lock.
//
// Spend one AVAILABLE note (proven a member of the pool root) and mint one LOCKED note of the SAME
// hidden amount, bound to `lockId`. Value is conserved STRUCTURALLY: the single private `amount`
// feeds both commitments, so the proof cannot mint a LOCKED note worth more (or less) than the spent
// note. The AVAILABLE note's key-derived nullifier is published so the pool marks it spent. This is
// a 1-in/1-out joinsplit (locks the ENTIRE note; no change output).
//
//   Private: amount, blindingIn, spendPk, nk, leafIndex, pathElements[levels], blindingOut
//   Public signals in SNARKJS ORDER (outputs first, then declared public inputs):
//     [0]=nullifierOut  [1]=commitmentOut  [2]=root  [3]=lockId   (nPublic = 4)
template Lock(levels) {
    // --- public ---
    signal input root;
    signal input lockId;
    // --- private ---
    signal input amount;
    signal input blindingIn;
    signal input spendPk;
    signal input nk;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input blindingOut;
    // --- public outputs ---
    signal output nullifierOut;
    signal output commitmentOut;

    // 0. Bind the nullifier key to the committed note: spendPk == H1(nk, DS_NK). Without this, nk is
    //    a free witness and one note yields unlimited distinct nullifiers → double-spend / unbounded
    //    mint / pool insolvency (audit C-01). Range-bound amount before it enters commitments (M-02).
    component nkBind = DomainHash1();
    nkBind.x <== nk;
    nkBind.domainSep <== 52; // DS_NK (0x34)
    nkBind.out === spendPk;

    component amountBits = Num2Bits(128);
    amountBits.in <== amount;

    // 1. Recompute the AVAILABLE input note (aux = 0).
    component cin = NoteCommitment();
    cin.domainSep <== 16; // DS_NOTE_AVAILABLE (0x10)
    cin.amount    <== amount;
    cin.spendPk   <== spendPk;
    cin.blinding  <== blindingIn;
    cin.aux       <== 0;

    // 2. Membership: the AVAILABLE note is in the committed pool root.
    component mp = MerkleProof(levels);
    mp.leaf <== cin.out;
    mp.pathElements <== pathElements;
    mp.pathIndices <== leafIndex;
    mp.root === root;

    // 3. Publish the key-derived nullifier (proves nk ownership; pool marks the note spent).
    component nf = Nullifier();
    nf.nk         <== nk;
    nf.commitment <== cin.out;
    nf.leafIndex  <== leafIndex;
    nullifierOut  <== nf.out;

    // 4. Mint the LOCKED output note of the SAME amount (value conserved), bound to lockId.
    component cout = NoteCommitment();
    cout.domainSep <== 17; // DS_NOTE_LOCKED (0x11)
    cout.amount    <== amount;
    cout.spendPk   <== spendPk;
    cout.blinding  <== blindingOut;
    cout.aux       <== lockId;
    commitmentOut  <== cout.out;
}
