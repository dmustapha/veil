pragma circom 2.2.2;

include "note_commitment.circom";
include "merkle_proof.circom";
include "nullifier.circom";
include "domain_hash.circom";

// Veil v3 UNLOCK joinsplit — client-side-provable port of guest/core/src/notes.rs::verify_unlock.
//
// The reverse of `lock`, but non-optionally GATED on a repay-proof. Prove ownership of a LOCKED note
// in the pool root, prove (THE INVARIANT) that the position tied to its `lockId` was REPAID on
// Stellar — `repaid_leaf(lock_handle(lockId))` is a member of the repaid-tree root — then publish the
// LOCKED note's nullifier and mint an AVAILABLE note of the SAME amount. Value is conserved
// structurally and the repay-proof is mandatory, so a borrower can never recover spendable collateral
// without repaying. In v3 BOTH roots are Soroban Poseidon trees (the pool + the vault's repaid-tree).
//
//   Public : rootPool, rootRepaid ; nullifierOut, commitmentOut (outputs)
//   Private: amount, blindingIn, spendPk, nk, lockId, leafIndex, pathElements[levels], blindingOut,
//            repaidLeafIndex, repaidPathElements[levels]
template Unlock(levels) {
    // --- public ---
    signal input rootPool;
    signal input rootRepaid;
    // --- private ---
    signal input amount;
    signal input blindingIn;
    signal input spendPk;
    signal input nk;
    signal input lockId;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input blindingOut;
    signal input repaidLeafIndex;
    signal input repaidPathElements[levels];
    // --- public outputs ---
    signal output nullifierOut;
    signal output commitmentOut;

    // 1. Recompute the LOCKED input note (aux = lockId).
    component cin = NoteCommitment();
    cin.domainSep <== 17; // DS_NOTE_LOCKED (0x11)
    cin.amount    <== amount;
    cin.spendPk   <== spendPk;
    cin.blinding  <== blindingIn;
    cin.aux       <== lockId;

    // 2. Membership: the LOCKED note is in the pool root.
    component mp = MerkleProof(levels);
    mp.leaf <== cin.out;
    mp.pathElements <== pathElements;
    mp.pathIndices <== leafIndex;
    mp.root === rootPool;

    // 3. Publish the key-derived nullifier (pool marks the LOCKED note spent).
    component nf = Nullifier();
    nf.nk         <== nk;
    nf.commitment <== cin.out;
    nf.leafIndex  <== leafIndex;
    nullifierOut  <== nf.out;

    // 4. THE REPAY-PROOF: repaid_leaf(lock_handle(lockId)) is a member of the repaid-tree root. Binds
    //    to the SAME lockId the spent LOCKED note commits, so unlock is impossible without repay.
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

    // 5. Mint an AVAILABLE note of the SAME amount (value conserved), aux = 0.
    component cout = NoteCommitment();
    cout.domainSep <== 16; // DS_NOTE_AVAILABLE (0x10)
    cout.amount    <== amount;
    cout.spendPk   <== spendPk;
    cout.blinding  <== blindingOut;
    cout.aux       <== 0;
    commitmentOut  <== cout.out;
}
