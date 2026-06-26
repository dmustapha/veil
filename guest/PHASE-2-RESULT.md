# Phase 2 — Privacy guest: VERIFIED in dev mode against real Sepolia data

The RISC Zero guest verifies a **real** `eth_getProof` (block 11143924, escrow
`0xb833ff…bd6f`, slot value 1e16) end-to-end, keeps the amount private, and emits the canonical
140-byte journal the Soroban vault decodes. Run: `RISC0_DEV_MODE=1 cargo run --release` in `guest/`.

## What the guest proves (private witnesses never enter the journal)
1. Account MPT proof: reconstructed account RLP verifies against state root `R` (authenticates the
   storage root).
2. Storage MPT proof: `locks[H].amount` slot holds `amount` under that storage root.
3. `amount >= threshold` — amount stays secret.
4. nullifier = keccak256("veil-null" ‖ escrow ‖ H).
5. commits `R ‖ block ‖ escrow ‖ threshold ‖ H ‖ nullifier` (140 bytes).

## Verified outputs
- journal = `0xe8ad78ff…dc21a851 0000000000aa0af4 b833ff…bd6f 00000000000000000011c37937e08000 23fed9f9…08a315 ee691cef…74d9f1`
- decodes to: state_root ✓, block 11143924 ✓, escrow ✓, threshold 5e15 (0.005 ETH) ✓, H ✓, nullifier ✓
- **amount 1e16 verified ≥ threshold yet absent from the journal** (host leak-check passed) — the load-bearing privacy property, demonstrated.
- host independently recomputed the journal → byte-identical to the guest's.

## image_id (dev-mode build)
`0x56be4e8f92da7142216c8d45a05bc54b436abdd09f0167587f56a67e05edf3e0`
(words `[2404302422,1114757778,1166896161,1271225248,3502074435,1483145631,2124830335,3774082309]`)
Regenerate + lock the real one at Phase 0b (it's the guest-ELF hash; stable unless guest/deps change).

## Tech
- `guest/methods/guest` — the zkVM program (alloy-trie MPT verify, alloy-rlp, alloy-primitives keccak)
- `guest/core` — shared `ProofInput` + `encode_journal` (byte-identical to `contracts/vault/src/journal.rs`)
- `guest/host` — loads `fixtures/eth_getproof_pinned.json`, runs, checks journal
- MPT verification via `alloy-trie` `verify_proof` (account + storage), proven against a live Alchemy proof.

## Remaining for the full chain
- Phase 0b (needs Bonsai key): wrap this to a real Groth16 receipt; verify it in the deployed vault.
  Confirm VK match (verifier params 3.0.0 vs toolchain 3.0.5) and the real image_id.
