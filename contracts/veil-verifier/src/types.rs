//! Groth16 proof / verification-key types (BN254), mirrored from Nethermind
//! stellar-private-payments `contracts/types` (Apache-2.0).
//!
//! **G2 byte ordering:** all G2 points (proof `b`, vk `beta/gamma/delta`) use Soroban's
//! `c1 || c0` (imaginary || real) 128-byte layout — the same ordering `build.rs` emits when it
//! transcodes the snarkjs `[c0, c1]` JSON. G1 points are `x || y` (64 bytes, big-endian).

use soroban_sdk::{
    contracterror, contracttype,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine},
    Bytes, BytesN, Vec,
};

/// Errors that can occur during Groth16 proof verification.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Groth16Error {
    /// The pairing product did not equal identity.
    InvalidProof = 0,
    /// The public inputs length does not match the verification key.
    MalformedPublicInputs = 1,
    /// The proof bytes are malformed.
    MalformedProof = 2,
}

/// Groth16 verification key for BN254 (byte-oriented; G2 points in Soroban `c1||c0` order).
#[contracttype]
#[derive(Clone)]
pub struct VerificationKeyBytes {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

/// Groth16 proof (points A, B, C); B is a G2 point in Soroban `c1||c0` order.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

/// Size of a single BN254 field element in bytes.
pub const FIELD_ELEMENT_SIZE: u32 = 32;
/// Size of a G1 point (x || y).
pub const G1_SIZE: u32 = FIELD_ELEMENT_SIZE * 2;
/// Size of a G2 point (x.c1 || x.c0 || y.c1 || y.c0).
pub const G2_SIZE: u32 = FIELD_ELEMENT_SIZE * 4;
/// Total serialized proof size: A (G1) || B (G2) || C (G1) = 64 + 128 + 64 = 256 bytes.
pub const PROOF_SIZE: u32 = G1_SIZE + G2_SIZE + G1_SIZE;

impl TryFrom<Bytes> for Groth16Proof {
    type Error = Groth16Error;

    /// Decode a 256-byte `A || B || C` blob into a proof (the shape the vault will pass on-chain).
    fn try_from(value: Bytes) -> Result<Self, Self::Error> {
        if value.len() != PROOF_SIZE {
            return Err(Groth16Error::MalformedProof);
        }
        let a = Bn254G1Affine::from_bytes(
            value.slice(0..G1_SIZE).try_into().map_err(|_| Groth16Error::MalformedProof)?,
        );
        let b = Bn254G2Affine::from_bytes(
            value
                .slice(G1_SIZE..G1_SIZE + G2_SIZE)
                .try_into()
                .map_err(|_| Groth16Error::MalformedProof)?,
        );
        let c = Bn254G1Affine::from_bytes(
            value
                .slice(G1_SIZE + G2_SIZE..PROOF_SIZE)
                .try_into()
                .map_err(|_| Groth16Error::MalformedProof)?,
        );
        Ok(Groth16Proof { a, b, c })
    }
}
