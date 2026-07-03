# Veil v3 Reverse Leg — Deep Critical Review (mop-up)

Adversarial audit after the 15-phase build. Per-task reviews + an Opus whole-branch review were all
clean, but those only see *code*. This pass hunted the *live integration state* — where the real
undiscovered deficiency was.

---

## 🔴 SHOWSTOPPER FOUND & FIXED — vault-reuse pool binding

**What was wrong.** `veil-vault.borrow` cross-calls `PoolClient::new(cfg.veil_pool).is_known_root(root)`
(`contracts/veil-vault/src/lib.rs:305`), and `veil_pool` is set **only in the constructor — no setter
exists.** I reused the existing vault `CCXGKWB5…`, whose `veil_pool` is bound to the **OLD** pool
`CDIHDUDQ…`. But our notes now live in the **NEW** pool. So the forward `borrow` would call
`OLD_pool.is_known_root(new_root)` → `false` → **revert `UnknownRoot`** → the whole forward leg (and
therefore the entire e2e) could never complete. The pool's one-time `set_vault` was already consumed
(pointing at that same mis-bound vault), so the reverse `release` would have mismatched too.

**Why the reviews missed it.** The reused vault was never in the diff — it's a *live cross-contract
binding*, invisible to any review of the branch's code changes. Only an on-chain state audit surfaces it.

**The fix (no code changes — pure wiring).** A matched fresh triple, all cross-pinned:
| Contract | Address | Binding |
|---|---|---|
| veil-pool **P2** | `CA7H5WQISBIWVEWXRBTGHSB3UMEFK7RR4QJHYGAMZVEV7NSW3MFJLHLN` | `set_vault(V2)`, `set_eth_lock(E3)` |
| veil-vault **V2** | `CAXOQQ7V4ZDI5TO5SJQQLGXHMWATL3VXXG5YBZJ33SCR7IJ3C7JRYBPT` | `veil_pool = P2`; LP 2 USDC |
| VeilEthLock **E3** (Sepolia) | `0x06bB519A490030DE251EeB83818F875Cc87002e0` | `trustedSource + destination = P2` |

Verifiers, circuits, contract code, and web code are all unchanged — only addresses. Web `onchain.ts`
repointed → P2/V2/E3; frontend redeployed to **veilzk.vercel.app** (P2 confirmed in the live bundle).
Verified: `P2.is_known_root` responds, `V2.repaid_count = 0`, `V2.total_assets = 2 USDC`, matched pins.

> This fix also *hardens* the demo: V2's repaid tree is guaranteed empty, so the pipeline's index-0
> Merkle-path assumption is now provably correct (see limitation #3).

---

## ⚠️ Open risks (flagged; not code bugs)

**1. Reverse Axelar source-address form — the one genuine unknown.** `E3.trustedSourceAddress` is pinned
to P2's strkey `CA7H5WQI…`. Whether Axelar delivers the Stellar *source* address in exactly this strkey
form for a **Stellar→EVM** message is **unproven** — no reverse leg has ever run before, and the §5.3
address-format question was explicitly left "test empirically." It's a one-time pin. **Mitigation:** if
`E3.execute` reverts `UntrustedSource` during the live e2e, we read the actual delivered `sourceAddress`
from Axelarscan and redeploy E3 with it (cheap on Sepolia). The forward direction is *not* at risk — it
reuses the EIP-55-checksummed form already proven in Phase 7.

**2. `pay_gas` is skipped (by design).** The reverse hop is emitted via `call_contract` only (atomicity is
preserved — a trap reverts the nullifier spend); the message is executed via **Axelarscan manual add-gas**
on the first run. This was a deliberate de-risking (the Stellar gas-service address + its
`authorize_as_current_contract` shape couldn't be confirmed in time). Documented in `RUNBOOK-reverse-e2e.md`.
Fully wireable later via `set_axelar_outbound` once calibrated.

**3. Repaid-path is index-0 only.** The vault's repaid tree is *incremental* (root + filled subtrees, no
stored leaves, no leaf event), so a client can only reconstruct a membership path when its leaf is at a
known index with computable (zero) siblings. Correct today (V2 fresh → our repay is leaf 0). A **second**
repay in the same tree would break the release path. Fine for the single-position demo; multi-position
needs app-side leaf tracking or a contract-emitted leaf event (future work).

**4. Client-side `r` custody.** The B1′ binding random `r` lives in encrypted localStorage. If the browser
vault is cleared between lock and release, `r` is lost and the escrowed WETH becomes unrecoverable from the
UI. Inherent to non-custodial note systems; the note vault is AES-GCM encrypted at rest. UX risk, not a bug.

**5. Reflector price freshness.** `borrow` reverts `StalePrice` if the Reflector ETH feed is older than
`MAX_PRICE_AGE_SECS`. A live external dependency (feed `CCYOZJCO…`), out of our control; prior demos worked.

**6. Single-party trusted setup.** The Groth16 ceremony is single-party dev (disclosed in `ceremony.sh`).
Not production-sound, but standard for a testnet/hackathon build and explicitly documented.

---

## ✅ Confirmed clean (live checks + reviews)

- **B1′ binding identical across lock circuit, release circuit, and web** (`0x35`, `Poseidon2(C0, r)`) — Opus review, file:line traced.
- **Insolvency attack genuinely blocked** — the "release an active loan's collateral via a repaid same-amount note" witness **aborts at witness generation** (Poseidon-collision-hard). Verified in Task 2.
- **Both ZK provers verify LIVE on-chain** (lock→LOCK_V2, release→RELEASE) + tamper rejected.
- **5-signal public vector matches circuit ↔ pool ↔ web**; **recipient double-representation coherent** (field-encoded to the proof, raw 20 bytes in the payload; `keccak(addr) mod r` matches Rust↔viem).
- **Atomicity + double-release**: `try_spend` before emit; guards `try_spend` (pool) + `released[C0]` (Ethereum); CEI + source-pinning + empty/unset-source guards in `execute`.
- **Live infra current**: Axelar chain name `stellar-2026-q1-2` (getChains), gateway `CB2JYOOZ…`, E3 EIP-55 checksum, all confirmed.
- **Matched pool/vault/ethlock** re-verified on-chain after the fix.
- **All suites green at HEAD**: web 103/103 (typecheck 0, build PASS), forge 68/68, veil-pool 39/39, veil-verifier 7/7. The one Minor (zero-`r` guard) is now closed.

---

## Verdict

The single severe deficiency (vault-reuse) is **fixed and verified live**. Everything else provable
without a live multi-hop run is proven. The remaining items are (a) one genuinely unverifiable-until-e2e
unknown — the reverse Axelar source-address form, with a clear one-redeploy mitigation — and (b) documented
design limitations/dependencies, none of which are correctness bugs in the shipped code.

**Confidence: high on correctness and security; the sole live gate is the reverse-hop source-address form,
which we resolve on first run.** Ready for the hands-on e2e.
