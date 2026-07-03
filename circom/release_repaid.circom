pragma circom 2.2.2;

include "note_commitment.circom";
include "merkle_proof.circom";
include "nullifier.circom";
include "domain_hash.circom";
include "poseidon2/poseidon2_hash.circom";
include "circomlib/circuits/bitify.circom";

// Veil v3 RELEASE-REPAID reverse leg — client-side-provable gate on Ethereum WETH escrow release.
//
// The borrower re-proves the B1' binding (Task 1) to unlock their ETH collateral after repaying.
// Structurally mirrors Unlock: prove a LOCKED note C1 in the pool root, prove it is owned by nk,
// prove its lockId is in the repaid tree (same repay-gate as Unlock), and additionally reveal C0
// (the original AVAILABLE note commitment) so the Ethereum relayer can identify the escrow to release.
// The solvency link: lockId = Poseidon2(C0, r, DS_LOCKBIND=0x35) proves that C1 was minted from C0
// in the lock step and a different C0 cannot unlock the same repaid note.
//
//   Private: amount, blindingIn (C1 blinding), spendPk, nk, lockId, r,
//            leafIndex, pathElements[levels], repaidLeafIndex, repaidPathElements[levels]
//   Public signals in SNARKJS ORDER (outputs first, then declared public inputs):
//     [0]=nullifierOut  [1]=C0  [2]=recipient  [3]=rootPool  [4]=rootRepaid   (nPublic = 5)
template ReleaseRepaid(levels) {
    // public inputs
    signal input C0;         // revealed AVAILABLE-note commitment; keys the Ethereum escrow
    signal input recipient;  // borrower EVM address, field-encoded (keccak(addr) mod r)
    signal input rootPool;
    signal input rootRepaid;

    // private inputs
    signal input amount;
    signal input blindingIn;   // the LOCKED note (C1) blinding
    signal input spendPk;
    signal input nk;
    signal input lockId;
    signal input r;            // B1' binding random
    signal input leafIndex;
    signal input pathElements[levels];
    signal input repaidLeafIndex;
    signal input repaidPathElements[levels];

    signal output nullifierOut;

    // (b) ownership: spendPk = H1(nk, DS_NK)
    component nkBind = DomainHash1();
    nkBind.x <== nk;
    nkBind.domainSep <== 52; // DS_NK (0x34)
    nkBind.out === spendPk;

    // range-bind amount (prevents field aliasing — audit M-02)
    component amountBits = Num2Bits(128);
    amountBits.in <== amount;

    // recompute C1 (LOCKED note, aux = lockId)
    component cin = NoteCommitment();
    cin.domainSep <== 17; // DS_NOTE_LOCKED (0x11)
    cin.amount    <== amount;
    cin.spendPk   <== spendPk;
    cin.blinding  <== blindingIn;
    cin.aux       <== lockId;

    // (a) C1 membership in rootPool
    component mp = MerkleProof(levels);
    mp.leaf <== cin.out;
    mp.pathElements <== pathElements;
    mp.pathIndices <== leafIndex;
    mp.root === rootPool;

    // (c) nullifier of C1 (single-release: same lockId can never release twice)
    component nf = Nullifier();
    nf.nk         <== nk;
    nf.commitment <== cin.out;
    nf.leafIndex  <== leafIndex;
    nullifierOut  <== nf.out;

    // (c') repaid gate: repaid_leaf(lock_handle(lockId)) is in rootRepaid
    component lh = DomainHash1();
    lh.x <== lockId;
    lh.domainSep <== 49; // DS_LOCK (0x31)
    component rl = DomainHash1();
    rl.x <== lh.out;
    rl.domainSep <== 50; // DS_REPAID (0x32)
    component mpr = MerkleProof(levels);
    mpr.leaf <== rl.out;
    mpr.pathElements <== repaidPathElements;
    mpr.pathIndices <== repaidLeafIndex;
    mpr.root === rootRepaid;

    // (d) B1' binding: lockId = Poseidon2(C0, r, DS_LOCKBIND) — the solvency link C1 <-> C0.
    // An attacker holding a REPAID note cannot release a DIFFERENT C0 escrow because this constraint
    // enforces that C0 is the exact AVAILABLE note from which C1 was locked.
    component bind = Poseidon2(2);
    bind.inputs[0] <== C0;
    bind.inputs[1] <== r;
    bind.domainSeparation <== 53; // DS_LOCKBIND = 0x35
    lockId === bind.out;

    // (e) bind recipient into the constraint system (anti-redirect: prevents substituting a different
    // withdrawal address after proof generation)
    signal recipientSq;
    recipientSq <== recipient * recipient;
}
