pragma circom 2.2.2;

include "note_commitment.circom";
include "merkle_proof.circom";
include "nullifier.circom";
include "domain_hash.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Veil v3 SEIZE joinsplit — client-side-provable port of guest/core/src/notes.rs::verify_seize.
//
// Spend a LOCKED note proven in the pool root, GATED on a default-proof — the position tied to its
// `lockId` was LIQUIDATED on Stellar (`liquidated_leaf(lock_handle(lockId))` is a member of the
// liquidated-tree root) — then split the value: the liquidator receives a note worth the PUBLIC
// floor `seized`, the borrower receives a change note worth the hidden remainder. Value is conserved
// structurally: `seized + change == amount` with `amount >= seized` enforced, so a seize can never
// mint more than the note was worth and a borrower can never be over-seized. The hidden `amount`
// never appears in the output; only the public floor `seized` does. Both roots are Soroban Poseidon
// trees (pool + vault liquidated-tree).
//
//   Public : rootPool, rootLiquidated, seized ; nullifierOut, commitmentLiquidator, commitmentChange
//   Private: amount, blindingIn, spendPk, nk, lockId, leafIndex, pathElements[levels],
//            liquidatedLeafIndex, liquidatedPathElements[levels], liquidatorPk, blindingLiquidator,
//            blindingChange
template Seize(levels) {
    // --- public ---
    signal input rootPool;
    signal input rootLiquidated;
    signal input seized;
    // --- private ---
    signal input amount;
    signal input blindingIn;
    signal input spendPk;       // borrower's key: owns the LOCKED note and receives the change
    signal input nk;
    signal input lockId;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input liquidatedLeafIndex;
    signal input liquidatedPathElements[levels];
    signal input liquidatorPk;  // liquidator's key: receives the seized floor note
    signal input blindingLiquidator;
    signal input blindingChange;
    // --- public outputs ---
    signal output nullifierOut;
    signal output commitmentLiquidator;
    signal output commitmentChange;

    // Range-bound the u128 values before the comparison / subtraction (comparators and field
    // subtraction don't range-check): out-of-range amount/seized could otherwise fake conservation.
    component amountBits = Num2Bits(128);
    amountBits.in <== amount;
    component seizedBits = Num2Bits(128);
    seizedBits.in <== seized;

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

    // 4. THE DEFAULT-PROOF: liquidated_leaf(lock_handle(lockId)) is a member of the liquidated root.
    component lh = DomainHash1();
    lh.x <== lockId;
    lh.domainSep <== 49; // DS_LOCK (0x31)
    component ll = DomainHash1();
    ll.x <== lh.out;
    ll.domainSep <== 51; // DS_LIQUIDATED (0x33)

    component mpl = MerkleProof(levels);
    mpl.leaf <== ll.out;
    mpl.pathElements <== liquidatedPathElements;
    mpl.pathIndices <== liquidatedLeafIndex;
    mpl.root === rootLiquidated;

    // 5. No over-seize: amount >= seized, so change = amount - seized is non-negative (no underflow).
    component ge = GreaterEqThan(128);
    ge.in[0] <== amount;
    ge.in[1] <== seized;
    ge.out === 1;
    signal change;
    change <== amount - seized;

    // 6. Liquidator note carries the PUBLIC `seized` floor (aux = 0, liquidator's key).
    component cl = NoteCommitment();
    cl.domainSep <== 16; // DS_NOTE_AVAILABLE (0x10)
    cl.amount    <== seized;
    cl.spendPk   <== liquidatorPk;
    cl.blinding  <== blindingLiquidator;
    cl.aux       <== 0;
    commitmentLiquidator <== cl.out;

    // 7. Change note carries the hidden remainder back to the borrower (value conserved, aux = 0).
    component cc = NoteCommitment();
    cc.domainSep <== 16; // DS_NOTE_AVAILABLE (0x10)
    cc.amount    <== change;
    cc.spendPk   <== spendPk;
    cc.blinding  <== blindingChange;
    cc.aux       <== 0;
    commitmentChange <== cc.out;
}
