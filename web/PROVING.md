# Veil proving backend

The `/app` Borrow flow needs a **real** RISC Zero Groth16 proof before it can call
`vault.borrow(seal, journal, borrower)`. A bad or fake proof traps the on-chain call, so no
USDC moves without one. This document describes the off-chain backend that produces that proof.

## The contract (client <-> server)

`web/lib/app/prove.ts` is the only client. It calls two routes:

- `POST /api/prove` with `{ h, escrow? }` -> `{ id }` (a CI run id to poll).
- `GET  /api/prove/status?id=<id>` -> one of:
  - `{ "state": "pending", "message": "..." }`  while CI runs (minutes),
  - `{ "state": "ready", "seal": "0x...", "journal": "0x..." }` when the proof is downloaded,
  - `{ "state": "error", "message": "..." }`  on failure or an unavailable host.

`BorrowFlow` takes the `seal` + `journal` from a `ready` response and submits the real
Freighter-signed `vault.borrow`. **A `ready` response is only ever returned from a real,
downloaded `proof.json`. The backend never fabricates a seal.**

## What happens on `POST /api/prove`

`app/api/prove/route.ts` -> `lib/server/prover.ts`:

1. **Derive the bound storage slot.** `amount_slot = keccak256(abi.encode(H, uint256(0))) + 1`
   - byte-identical to the guest's binding (`guest/methods/guest/src/main.rs`), so the proof
   attests `locks[H].amount >= threshold`, not "some slot >= threshold".
2. **Live `eth_getProof`.** A raw JSON-RPC `eth_getProof(escrow, [amount_slot], block)` on
   Sepolia (block = chain head minus `PROVE_CONFIRMATIONS`, default 6). The raw result already
   has the exact field shape the host deserializes: `accountProof[]`, `balance`, `nonce`,
   `storageHash`, `codeHash`, `storageProof[0].{key,value,proof[]}`. A companion
   `fixture_meta.json` is assembled (`escrow`, `hashlock`, `amount_slot`, `pinned_block`,
   `state_root` from `eth_getBlockByNumber`, plus informational fields). If the slot value is
   `0` (no lock) the route returns an honest error and does nothing else.
3. **Ensure a checkpoint (DISCLOSED TRUST).** `get_checkpoint(block)` is read; if the root is
   missing, the admin identity posts `(block, state_root)` via
   `stellar contract invoke ... post_checkpoint`. This is the single trusted component: it only
   attests "this `(block, state_root)` is canonical"; it cannot forge the proof. A light client
   replaces it in future work.
4. **Dispatch the prover.** `gh workflow run prove.yml -f fixture_b64=... -f meta_b64=...` sends
   the fixture (base64, ~10 KB, well under the dispatch input limit). The workflow decodes the
   two inputs over `guest/fixtures/*.json`, then runs the **unchanged** host
   (`cargo run --release`), which proves the user's lock and uploads `proof.json` (seal +
   journal + image_id). The created run id is resolved by listing recent `workflow_dispatch`
   runs and taking the newest one created at/after the dispatch.

`GET /api/prove/status` calls `gh run view <id>`; on `completed`+`success` it
`gh run download <id> -n veil-proof`, reads `proof.json`, and returns `{ seal, journal }`.

The guest is never touched, so the image id stays
`0xc1fb4c3a0ef6736f4abff926f44b37ff173724b5ff6e0deeea2236ca7577b245` and the deployed verifier
keeps accepting the seal. The host is unchanged too - the workflow only swaps the fixture files
it already reads.

## What must be true for a real user's borrow to complete

| Requirement | Where it comes from | If missing |
| --- | --- | --- |
| `gh` CLI, authed, write access to the repo | the host's keyring (`dmustapha`), or `GH_TOKEN` | `POST` returns 503 `unavailable` |
| `prove.yml` with the `fixture_b64`/`meta_b64` inputs on the repo **default branch** | push this change once (`workflow_dispatch` always runs the default-branch definition) | `gh workflow run` rejects the unknown inputs |
| Stellar admin key for `post_checkpoint` | `stellar` CLI identity `veil-spike` (vault admin), local keychain | `POST` returns 503; borrow would later hit `UnknownCheckpoint` |
| Sepolia RPC that serves `eth_getProof` at the proven block | `SEPOLIA_RPC_URL` (archive provider recommended), else a public node | recent blocks work on the public node; old/deep blocks need an archive RPC token |
| `@stellar/stellar-sdk` reachable testnet RPC | `SOROBAN_RPC` (public testnet) | checkpoint read/post fails |

Config env (all optional, sane defaults): `GITHUB_REPO` (`dmustapha/veil`),
`STELLAR_ADMIN_SOURCE` (`veil-spike`), `STELLAR_NETWORK` (`testnet`),
`PROVE_CONFIRMATIONS` (`6`), `SEPOLIA_RPC_URL`.

## Where this can and cannot run

It runs **only where `gh` and the Stellar admin key live** - a developer machine or a keyed host
(a small always-on box, a Fly.io/Railway service with the key + `gh` installed). On a stock
serverless host (Vercel) there is no `gh` and no admin key, so both routes report a clear
`unavailable` reason and the UI tells the user honestly. We never ship a fake proof to keep the
demo "working".

## Swapping in Bonsai or a rented prover box

`dispatchProof` and `runStatus` in `lib/server/prover.ts` are the **only** two functions that
talk to CI. The API contract is "a job id in, `{ state, seal, journal }` out". To move proving
to Bonsai (or a dedicated GPU box), replace those two bodies:

- `dispatchProof(fixture)` -> submit the `ProofInput` to Bonsai / the box, return its job id.
- `runStatus(id)` -> poll that job; on success return `{ state: "ready", seal, journal }`.

Nothing else changes: the slot derivation, the `eth_getProof` transform, the checkpoint posting,
the routes, and the client all stay as-is. The seal Bonsai returns is the same Groth16 seal the
Soroban verifier already accepts (same image id).
