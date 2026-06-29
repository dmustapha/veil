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

Per-borrow, the guest binary is never rebuilt — only its fixture inputs change — so the image id
stays `0x494bfee75ad39a6f61e13f496af1ca2b798cca229ef94c5a094723c9901207ad` and the deployed verifier
keeps accepting the seal. The host is unchanged too - the workflow only swaps the fixture files
it already reads. (The guest binary itself last changed when the borrower-recipient binding was
added, which is what set this image id.)

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

## Privacy of the proving surface (important)

The witness the host proves over — the raw `eth_getProof` result — **contains the exact collateral
amount**: per EIP-1186 each `storageProof[].value` IS the slot's contents, and `locks[H].amount`
is that slot. So the proving surface must keep that value private:

- **The host never prints the amount.** `guest/host/src/main.rs` logs only the public `threshold`.
- **The workflow never prints the witness.** `prove.yml` passes the fixture via `env:` (not inline
  `${{ }}` interpolation) and does not `cat` the fixture/meta. `proof.json` (seal + journal +
  threshold) carries no amount, so showing it is safe.
- **`/api/prove/status` is authenticated.** It returns `{seal, journal}` only for an HMAC-signed
  job token handed to the caller by `POST /api/prove`, so a real proof cannot be harvested by
  polling guessable run ids.

**The one surface this does not fully cover is a *public* CI repo.** A `workflow_dispatch` input
value and an uploaded artifact are world-visible on a public repository — so a real user's private
amount must **not** be proven on the public submission repo. The demo's pinned fixture is exempt:
its amount (0.01 ETH) is already public on Etherscan and committed under `guest/fixtures`, so
proving it on public CI leaks nothing new. For a real user, route proving to a **private prover**:

- **Bonsai** (the prover operator sees the witness — disclosable — but the public does not), or
- a **self-hosted runner / private repo** that runs the identical, unchanged guest (so the image id
  stays `0x494bfee7…` and the deployed Soroban verifier keeps accepting the seal).

`dispatchProof` already accepts a `GITHUB_REPO` override, so pointing real-user proving at a private
repo is a one-env change with no code or guest change. The bearer-redeemable-proof hole (a stolen
`{seal, journal}` redeemed by a different recipient) is closed at the protocol layer by binding the
borrower address into the journal and asserting it on-chain in `borrow` (see the vault + guest).

## Swapping in Bonsai or a rented prover box

`dispatchProof` and `runStatus` in `lib/server/prover.ts` are the **only** two functions that
talk to CI. The API contract is "a job id in, `{ state, seal, journal }` out". To move proving
to Bonsai (or a dedicated GPU box), replace those two bodies:

- `dispatchProof(fixture)` -> submit the `ProofInput` to Bonsai / the box, return its job id.
- `runStatus(id)` -> poll that job; on success return `{ state: "ready", seal, journal }`.

Nothing else changes: the slot derivation, the `eth_getProof` transform, the checkpoint posting,
the routes, and the client all stay as-is. The seal Bonsai returns is the same Groth16 seal the
Soroban verifier already accepts (same image id).
