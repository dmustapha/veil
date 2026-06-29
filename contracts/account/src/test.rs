#![cfg(test)]
extern crate std;

use crate::{Error, ProofSig, VeilAccount, VeilAccountClient};
use risc0_interface::VerifierError;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{
    auth::Context, contract, contractimpl, Address, Bytes, BytesN, Env, IntoVal, Vec,
};

/// Mock verifier: accepts iff the seal equals sha256(journal) — same binding shape the real
/// BN254 verifier enforces, so the __check_auth logic is exercised without real proving.
#[contract]
struct MockVerifier;
#[contractimpl]
impl MockVerifier {
    pub fn verify(
        env: Env,
        seal: Bytes,
        _image_id: BytesN<32>,
        journal: BytesN<32>,
    ) -> Result<(), VerifierError> {
        let expected = Bytes::from_array(&env, &journal.to_array());
        if seal == expected {
            Ok(())
        } else {
            Err(VerifierError::InvalidProof)
        }
    }
}

const RECIP: [u8; 32] = [0xAB; 32];
const NULL: [u8; 32] = [0xCD; 32];

/// A 172-byte journal whose nullifier is `null` [108..140) and recipient is `recip` [140..172).
fn journal(env: &Env, recip: &[u8; 32], null: &[u8; 32]) -> Bytes {
    let mut b = Bytes::new(env);
    b.append(&Bytes::from_array(env, &[0u8; 108])); // R..H (unused here)
    b.append(&Bytes::from_array(env, null));
    b.append(&Bytes::from_array(env, recip));
    b
}

/// The seal the mock accepts = sha256(journal).
fn seal_for(env: &Env, journal: &Bytes) -> Bytes {
    Bytes::from_array(env, &env.crypto().sha256(journal).to_bytes().to_array())
}

struct F<'a> {
    env: Env,
    id: Address,
    client: VeilAccountClient<'a>,
}

fn setup() -> F<'static> {
    let env = Env::default();
    let verifier = env.register(MockVerifier, ());
    let id = env.register(VeilAccount, ());
    let client = VeilAccountClient::new(&env, &id);
    let image_id = BytesN::from_array(&env, &[0x11; 32]);
    let recipient = BytesN::from_array(&env, &RECIP);
    client.init(&verifier, &image_id, &recipient);
    F { env, id, client }
}

/// Drive __check_auth exactly as the host does during require_auth.
fn check(f: &F, sig: ProofSig) -> Result<(), Result<Error, soroban_sdk::InvokeError>> {
    let payload = BytesN::from_array(&f.env, &[0u8; 32]);
    let ctx: Vec<Context> = Vec::new(&f.env);
    f.env
        .try_invoke_contract_check_auth::<Error>(&f.id, &payload, sig.into_val(&f.env), &ctx)
}

#[test]
fn valid_proof_authorizes_and_consumes_nullifier() {
    let f = setup();
    let j = journal(&f.env, &RECIP, &NULL);
    let sig = ProofSig { seal: seal_for(&f.env, &j), journal: j };
    assert_eq!(check(&f, sig), Ok(()));
    assert!(f.client.is_used(&BytesN::from_array(&f.env, &NULL)));
}

#[test]
fn replay_blocked() {
    let f = setup();
    let j = journal(&f.env, &RECIP, &NULL);
    let sig = ProofSig { seal: seal_for(&f.env, &j), journal: j };
    assert_eq!(check(&f, sig.clone()), Ok(()));
    assert_eq!(check(&f, sig), Err(Ok(Error::ProofReused)));
}

#[test]
fn wrong_recipient_rejected() {
    let f = setup();
    let other = [0x99; 32];
    let j = journal(&f.env, &other, &NULL);
    let sig = ProofSig { seal: seal_for(&f.env, &j), journal: j };
    assert_eq!(check(&f, sig), Err(Ok(Error::WrongRecipient)));
}

#[test]
fn forged_seal_traps() {
    let f = setup();
    let j = journal(&f.env, &RECIP, &NULL);
    let bad = ProofSig { seal: Bytes::from_array(&f.env, &[0u8; 32]), journal: j };
    // the verifier rejects a forged seal -> the whole auth traps (not a clean contract error)
    assert!(check(&f, bad).is_err());
}

#[test]
fn double_init_rejected() {
    let f = setup();
    let v = Address::generate(&f.env);
    let res = f.client.try_init(
        &v,
        &BytesN::from_array(&f.env, &[0x22; 32]),
        &BytesN::from_array(&f.env, &RECIP),
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}
