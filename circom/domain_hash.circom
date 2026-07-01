pragma circom 2.2.2;

include "poseidon2/poseidon2_hash.circom";

// Single-input, domain-separated hash — the Poseidon2 port of v2's `SHA256(TAG ‖ x)` family
// (position_id, lock_handle, repaid_leaf, liquidated_leaf). Reuses the GATE-T3-locked primitive
// `Poseidon2(2)` with the second input pinned to 0, so every derived identifier composes the same
// proven hash and stays byte-identical to the Soroban `notes::domain_hash1`.
//
//   H1(x, ds) = Poseidon2(2)(x, 0, ds)
template DomainHash1() {
    signal input x;
    signal input domainSep;
    signal output out;

    component h = Poseidon2(2);
    h.inputs[0] <== x;
    h.inputs[1] <== 0;
    h.domainSeparation <== domainSep;
    out <== h.out;
}
