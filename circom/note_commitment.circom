pragma circom 2.2.2;

include "poseidon2/poseidon2_hash.circom";

// Veil v3 note commitment (BN254 Poseidon2, client-side-provable).
//
// Ports v2's SHA-256 `note_commitment` to a domain-separated chain of the t=3 primitive
// `Poseidon2(2)` (2 inputs + a `domainSeparation` capacity element). The note DOMAIN
// (AVAILABLE vs LOCKED) is carried by `domainSep`, which the joinsplit circuits wire to a
// fixed constant per note role (a prover cannot forge the domain). `aux` binds the lockId for
// LOCKED notes (0 for AVAILABLE). Byte-identical to the Soroban `note_commitment`.
//
//   C = H( H( H(amount, spendPk, ds), blinding, ds), aux, ds )   where H = Poseidon2(2)
template NoteCommitment() {
    signal input domainSep;   // DS_NOTE_AVAILABLE (0x10) or DS_NOTE_LOCKED (0x11)
    signal input amount;
    signal input spendPk;
    signal input blinding;
    signal input aux;
    signal output out;

    component h1 = Poseidon2(2);
    h1.inputs[0] <== amount;
    h1.inputs[1] <== spendPk;
    h1.domainSeparation <== domainSep;

    component h2 = Poseidon2(2);
    h2.inputs[0] <== h1.out;
    h2.inputs[1] <== blinding;
    h2.domainSeparation <== domainSep;

    component h3 = Poseidon2(2);
    h3.inputs[0] <== h2.out;
    h3.inputs[1] <== aux;
    h3.domainSeparation <== domainSep;

    out <== h3.out;
}
