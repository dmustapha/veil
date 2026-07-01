//! GATE ZERO — prove the Soroban BN254 Poseidon2 (CAP-0075 hazmat host fn) reproduces the Circom
//! PoseidonCompress vector byte-for-byte. constants.rs + poseidon2.rs are mirrored VERBATIM from
//! Nethermind stellar-private-payments (Apache-2.0) so the host-fn call signature is identical.
#![no_std]
mod constants;
pub mod poseidon2;

#[cfg(test)]
mod gate_zero_test {
    use crate::poseidon2::poseidon2_compress;
    use soroban_sdk::{Bytes, Env, U256};

    // circom PoseidonCompress(1,2), locked in circom/README.md.
    const EXPECTED: [u8; 32] = [
        0x0e, 0x90, 0xc1, 0x32, 0x31, 0x1e, 0x86, 0x4e, 0x0c, 0x8b, 0xca, 0x37, 0x97, 0x6f, 0x28,
        0x57, 0x9a, 0x2d, 0xd9, 0x43, 0x6b, 0xbc, 0x11, 0x32, 0x6e, 0x21, 0xec, 0x7c, 0x00, 0xce,
        0xa5, 0xb3,
    ];

    #[test]
    fn soroban_poseidon2_matches_circom_vector() {
        let env = Env::default();
        let out = poseidon2_compress(&env, U256::from_u32(&env, 1), U256::from_u32(&env, 2));
        let expected = U256::from_be_bytes(&env, &Bytes::from_array(&env, &EXPECTED));
        assert_eq!(out, expected, "Soroban Poseidon2 must byte-match the Circom PoseidonCompress(1,2)");
    }
}
