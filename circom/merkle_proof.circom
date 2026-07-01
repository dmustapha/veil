pragma circom 2.2.2;
// Depth-parametric Poseidon2 Merkle membership, adapted from Nethermind stellar-private-payments
// (Apache-2.0), itself from tornado-nova. Uses the BN254 Poseidon2 `PoseidonCompress` (t=2) for
// internal nodes — byte-identical to the Soroban `poseidon2_compress`, so a root computed here
// matches the on-chain `MerkleTreeWithHistory` root (GATE ZERO proved the compress equality).
//
// `pathIndices` is the leaf index; its bit `i` selects whether `pathElements[i]` is the right (bit
// 0 → we are left) or left (bit 1 → we are right) sibling at level `i`, matching the Soroban
// insert's index-bit ordering. Returns the computed root; the joinsplit circuit MUST constrain it
// equal to a published root.

include "poseidon2/poseidon2_compress.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/switcher.circom";

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices;
    signal output root;

    component switcher[levels];
    component hasher[levels];

    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndices;

    for (var i = 0; i < levels; i++) {
        switcher[i] = Switcher();
        switcher[i].L <== i == 0 ? leaf : hasher[i - 1].out;
        switcher[i].R <== pathElements[i];
        switcher[i].sel <== indexBits.out[i];

        hasher[i] = PoseidonCompress();
        hasher[i].inputs[0] <== switcher[i].outL;
        hasher[i].inputs[1] <== switcher[i].outR;
    }

    root <== hasher[levels - 1].out;
}
