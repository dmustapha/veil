# Phase 0a — Go/No-Go Gate: RESULT = **GO** ✅

Date: 2026-06-26. The novel half of Veil — a RISC Zero Groth16-BN254 receipt verified
*inside a Soroban testnet contract* — is proven with a known-good fixture and **zero Bonsai
dependency**. No wall. Proceed to build.

## What was proven
A known-good RISC Zero Groth16 receipt (the 260-byte seal shipped in NethermindEth/
stellar-risc0-verifier's own test fixtures, RISC Zero v3.0.0) verifies on Soroban — both in
the local `Env` (real BN254 host functions) and on **live testnet**.

## Toolchain (confirmed installed this session)
- foundry forge 1.4.4 · stellar-cli 25.2.0 · rust 1.91.1 (system)
- rzup 0.5.0 → cargo-risczero 3.0.5, r0vm 3.0.5, risc0 rust 1.94.1
- Host: Apple M1, **8 GB RAM, arm64** → local Groth16 *generation* impossible (x86_64 + 16-32GB).
  Verification works anywhere. Confirms Bonsai-for-wrap decision (Phase 0b).

## Local gate (Soroban Env, real host fns)
`cargo test -p groth16-verifier` → **4 passed** incl. `test_verify_proof`.
Verifier params (from build.rs): VERSION 3.0.0, SELECTOR 73c457ba,
VERIFIER_KEY_DIGEST 21c5fdd9b4d576b17581f50b755482ba7a2134a3b5186e8e454acfa1f69511ab.

## Live testnet gate
- Identity: `veil-spike` = GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF (funded)
- Verifier WASM: 17104 bytes, hash 67226e293061ce1708912d86c8e0f4a683296506159ac6156f711a4a841a0fe0
- **Deployed contract: `CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L`**
- Deploy tx: 1e6f3243b0dd2865093ed919df5390d42413ded37cd7a789617d0ddbc58e463d

| Case | Input | Result on testnet |
|------|-------|-------------------|
| Valid receipt | fixture seal + image_id + journal_digest | `Ok(())` — tx `76f0e3f4698fb34ae9e3df088eb9f379158f1dd9888043ce7ed59acf35845c84` ✅ |
| Malformed seal (flip proof byte) | seal[10]^=1 | **revert** — `bn254 G1: point not on curve` → pairing host trap ✅ |
| Valid seal, falsified claim | wrong journal digest | **revert** — `Error(Contract, #0)` = `VerifierError::InvalidProof` (pairing returned false) ✅ |

The third case is the demo's "cheat that fails": a well-formed proof against a false statement
is rejected cleanly by the pairing check. No state change on any reject.

## Fixture inputs (for reuse)
- seal: 73c457ba…680311b (260 bytes) · image_id: a77e54910c792ddc3f14878f3f1360af96612408d69074e87389a215f57595b9
- journal_digest: 0975cd92bbee031820e817f5ed9ce479af10e785b51c9ed16c572d5c90110608  (= sha256(01000078))

## What remains unproven until Phase 0b (needs Bonsai key)
0a used a *known-good* receipt. Phase 0b proves OUR OWN guest: generate a Groth16 proof of a
real Sepolia storage slot via Bonsai, verify the same way. Risk now isolated to the guest +
public-input wiring, not the zkVM→Soroban link (proven here). VK compatibility: deployed
verifier = RISC Zero 3.0.0; our toolchain = 3.0.5 — confirm at 0b.
