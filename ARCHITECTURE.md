# Veil — Architecture (build-ready spec)

Derived from the locked charter `SCOPE.md`. Phase 0a spike = GO (`spike/PHASE-0A-RESULT.md`).
This document turns the charter into concrete interfaces, the journal schema, and a file layout.
Where this doc sharpens a claim in SCOPE.md, it is flagged **[SHARPENED]** and stays faithful to
SCOPE's existing guardrails (§12).

---

## 0. The privacy threat model, stated exactly [SHARPENED]

The honest, defensible privacy property — the thing the ZK is load-bearing for:

> **The Stellar side never learns the borrower's Ethereum amount or address.** The Stellar
> ledger, the lender, and every Stellar observer see only `{threshold T, nullifier, hashlock H,
> proof}`. They never see the exact collateral amount (only `≥ T`) nor the Ethereum wallet.

Why the ZK is irreducible: delete it, and `borrow()` on Stellar would have to carry the Ethereum
amount + address in cleartext so Soroban could check the Merkle proof itself — publishing both on
the Stellar ledger permanently. Native Merkle verification cannot hide them; only the SNARK can.

What we **do not** claim (consistent with SCOPE §12):
- Not full unlinkability. The hashlock `H` is public on both chains; a determined **Ethereum-side**
  observer can correlate the escrow lock to the loan via `H`, and Ethereum storage is public.
  Strengthening to a shielded-pool deposit (commitment Merkle tree, fixed denominations) so the
  Ethereum amount is hidden on Ethereum *too* is named **future work**.
- The privacy boundary we ship and demo is **Stellar-side confidentiality**, which is real,
  load-bearing, and exactly what a borrower who doesn't want to dox their position to a Stellar
  lender needs.

---

## 1. End-to-end flow

```
 ETHEREUM (Sepolia)                 OFF-CHAIN (borrower + relayers)            STELLAR (testnet)
 ─────────────────                  ──────────────────────────────            ─────────────────
 Escrow.lock(H, value) ──┐
   real ETH locked       │  borrower picks secret S, H = keccak(S)
   stores lock[H]={amt,  │
   depositor, H, ...}    │
                         │  checkpoint relayer posts (state_root R,
                         └─ block B) ──────────────────────────────────►  Vault.post_checkpoint(R,B)
                                                                              [DISCLOSED trust]
   eth_getProof(Escrow,  ─► RISC Zero guest (private: amt, addr, slot)
     slot(H)) @ R           proves amt ≥ T ∧ lock hashlock = H ∧
                            slot ∈ R ;  commits journal J (below)
                            → STARK → Bonsai → Groth16-BN254 seal
                                                                          ►  Vault.borrow(seal,
                                                                                image_id, J)
                                                                              verifies via Nethermind
                                                                              router → checks R is a
                                                                              known checkpoint, T sane,
                                                                              nullifier unused, records
                                                                              {nullifier,H} → disburses
                                                                              loan = f(T, Reflector px)
                                                                              of real Circle USDC
 repay path:                          borrower repays USDC on Stellar  ◄─  Vault.repay() → reveals S
 Escrow.claim_repaid(S) ◄─ relay S ── (S now public on Stellar)
   verifies keccak(S)=H, returns ETH to depositor
 default paths (Ethereum-only):
   Escrow.liquidate_price()  (oracle says underwater → anyone → lender)
   Escrow.liquidate_timeout() (deadline passed → lender)   [timeout favors LENDER]
```

No Stellar→Ethereum proof is ever required. Enforcement lives where the collateral lives.

---

## 2. The journal `J` (public outputs the guest commits) — the crux

Committed (public, on the Stellar ledger):
| field | bytes | meaning | checked by vault |
|-------|-------|---------|------------------|
| `state_root` R | 32 | Ethereum state root the proof is against | must equal a posted checkpoint |
| `block_number` B | 8 | block of R (for checkpoint lookup / freshness) | within freshness window |
| `escrow_addr` E | 20 | the escrow contract (fixed, public) | must equal configured escrow |
| `threshold` T | 16/32 | collateral ≥ T (in wei) | T ≥ min; loan sized from T |
| `hashlock` H | 32 | keccak(S); binds escrow lock ↔ loan | stored; repay reveals S |
| `nullifier` N | 32 | = keccak("veil-null" ‖ E ‖ H) | must be unused; recorded |

Private witnesses (never leave the guest): exact `amount`, depositor `address`, the storage
`slot`/lock index, the Merkle/MPT proof nodes.

`nullifier` is deterministic from (E,H) so one escrow lock yields exactly one loan; recording it
prevents proof replay. Journal is serialized canonically; `journal_digest = sha256(journal_bytes)`
is what the Nethermind verifier consumes (matches Phase 0a fixture path).

---

## 3. Components & interfaces

### 3.1 Sepolia escrow — `contracts/escrow/` (Foundry, Solidity)
```solidity
struct Lock { address depositor; uint256 amount; bytes32 H; uint64 deadline; bool closed; }
mapping(bytes32 => Lock) public locks;        // keyed by H (one open lock per H)
address public immutable lender;              // receives collateral on default
function lock(bytes32 H, uint64 deadline) external payable;   // real ETH; amount=msg.value
function claimRepaid(bytes32 S) external;     // keccak256(abi.encodePacked(S))==H → ETH→depositor
function liquidateTimeout(bytes32 H) external;// block.timestamp>deadline → ETH→lender
function liquidatePrice(bytes32 H) external;  // [STRETCH] oracle underwater → ETH→lender
```
Invariant: every exit favors the lender on the default side; the borrower only reclaims by
revealing `S`. `deadline` must be set so the Stellar loan term ends BEFORE it (lender-favoring).

### 3.2 RISC Zero guest — `guest/` (methods/ + host/)
Input (private stdin): `amount`, `depositor`, `slot`, MPT proof nodes, `H`, `S?` no — S stays with
borrower; only `H` needed. Plus public params it re-commits: `R`, `B`, `E`, `T`.
Logic (plain Rust, keccak precompile, `alloy-trie` MPT verify):
1. Verify the account proof: `E` exists in state root `R`.
2. Verify the storage proof: `locks[H].amount == amount`, `locks[H].H == H`, against `E`'s storage root.
3. Assert `amount ≥ T`.
4. Compute `N = keccak("veil-null" ‖ E ‖ H)`.
5. `env::commit` the journal `J = {R,B,E,T,H,N}`. **Never commit `amount` or `depositor`.**
Host wraps STARK→Groth16 via Bonsai (Phase 0b). DEV_MODE tests the guest logic with no proving.

### 3.3 Soroban vault — `contracts/vault/` (soroban-sdk, our own)
```rust
fn init(e, admin, usdc_sac: Address, router: Address, image_id: BytesN<32>,
        escrow_addr: BytesN<20>, reflector: Address);
fn post_checkpoint(e, admin, block: u64, state_root: BytesN<32>);   // [DISCLOSED trust]
fn borrow(e, seal: Bytes, journal: Bytes) -> i128;  // ATOMIC: verify ∧ disburse
//   1. journal_digest = sha256(journal); router.verify(seal, IMAGE_ID, journal_digest)
//   2. decode journal → {R,B,E,T,H,N}; require R==checkpoint[B], E==escrow_addr, T≥MIN, N unused
//   3. loan = T * reflector_px(ETH/USDC) * LTV ; transfer USDC SAC → borrower
//   4. record loans[H]={N, T, loan, due}; mark nullifier N used
fn repay(e, H: BytesN<32>, secret: Bytes);  // pulls USDC back; stores S so it can relay to Ethereum
fn liquidate_on_timeout(e, H);              // marks loan defaulted on Stellar (collateral claimed on ETH)
```
Verification + disbursement in ONE call = the credibility property (money moves *because of* the proof).
Reuse the Nethermind router/verifier (Phase 0a) via `risc0-interface` client. Nullifier set uses
Soroban persistent storage with TTL extension (state-archival aware).

### 3.4 Relayers + client — `relayer/`, `web/`
- checkpoint relayer: reads Sepolia head, posts `(R,B)` to vault. Disclosed trust; light-client = future.
- secret-reveal relay: on Stellar `repay`, picks up `S`, calls `Escrow.claimRepaid(S)` on Sepolia.
- thin client: MetaMask (lock on Sepolia) + Freighter (borrow/repay on Stellar) + proof status.

---

## 4. File layout
```
stellar-hacks-zk/
  spike/                     # Phase 0a evidence (DONE) + Nethermind verifier clone
  contracts/
    escrow/                  # Foundry: Veil escrow (Sepolia)        [Phase 1]
    vault/                   # Soroban: Veil lending vault           [Phase 3]
    verifier/                # vendored Nethermind router+groth16 (or git dep)
  guest/                     # RISC Zero guest + host                [Phase 2 / 0b]
  relayer/                   # checkpoint + secret-reveal            [Phase 4]
  web/                       # thin client                          [Phase 4]
  ARCHITECTURE.md SCOPE.md README.md
```

## 5. Build order (parallelizable; only 0b needs the Bonsai key)
1. **Phase 1** escrow (Sepolia) — independent, start now.
2. **Phase 3** vault (Soroban) — independent of guest; uses the proven verifier path.
3. **Phase 2** guest — develop + test in `RISC0_DEV_MODE` (no key).
4. **Phase 0b** — Bonsai-wrap a real Sepolia-slot proof; confirm VK (verifier=3.0.0, toolchain=3.0.5).
5. **Phase 4–5** relayers, client, end-to-end, cheat-fails, README, demo.

## 6. Pinned testnet constants
- Circle USDC issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- Circle USDC SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Reflector ETH/USDC feed `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`
- Phase 0a verifier (standalone groth16) `CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L`
- Spike identity `veil-spike` = `GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF`
