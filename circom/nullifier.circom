pragma circom 2.2.2;

include "poseidon2/poseidon2_hash.circom";

// Veil v3 key-derived nullifier (BN254 Poseidon2, client-side-provable).
//
// Ports v2's SHA-256 `nullifier(nk, C, leafIndex) = SHA256(NF_TAG ‖ nk ‖ C ‖ leafIndex)` to a
// domain-separated chain of the t=3 primitive `Poseidon2(2)`. The nullifier is Penumbra-style:
// unlinkable to the note without the nullifier key `nk`, and deterministic given `nk`, the note
// commitment `C`, and the leaf index — so spending the same note twice yields the same nullifier
// (double-spend detectable) while revealing nothing about the note.
//
// DS_NF (0x20) is DISTINCT from the note-commitment domains (0x10 / 0x11) so a nullifier hash can
// never collide with a note-commitment hash. Byte-identical to the Soroban `notes::nullifier`.
//
//   nf = H( H(nk, C, DS_NF), leafIndex, DS_NF )      where H = Poseidon2(2)
template Nullifier() {
    signal input nk;          // nullifier key (secret)
    signal input commitment;  // the note commitment C being spent
    signal input leafIndex;   // the note's position in the tree

    signal output out;

    component h1 = Poseidon2(2);
    h1.inputs[0] <== nk;
    h1.inputs[1] <== commitment;
    h1.domainSeparation <== 32; // DS_NF = 0x20

    component h2 = Poseidon2(2);
    h2.inputs[0] <== h1.out;
    h2.inputs[1] <== leafIndex;
    h2.domainSeparation <== 32; // DS_NF = 0x20

    out <== h2.out;
}
