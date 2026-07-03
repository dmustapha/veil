# Veil v3 — Reverse Cross-Chain Leg (repay/liquidation → release WETH)

**Status:** Design approved · **binding-design spike COMPLETE (2026-07-03)** · ready for `writing-plans`.
**Branch:** `v3-soroban-native` · **Date:** 2026-07-03

> ✅ **Spike resolved (see §2.5 / §2.6).** The insolvency gap is closed by **B1′** — bind `C0` into
> the LOCKED note's `lockId` *derivation* (`lockId = Poseidon2(C0, r)`, `r` a secret random), a
> one-constraint change to the `lock` circuit that leaves the note-commitment *structure* — and
> therefore the deployed `unlock`/`seize`/`borrow`/`deposit` circuits — untouched. **Liquidation-release
> is deferred** to the shielded-WETH-pool milestone (§2.6): its collateral recovery is architecturally
> borrower-authored and cannot be made economically live in v1. **v1 ships the repay-release path only.**

---

## 0. One-paragraph summary

Veil v3's forward leg is live and proven: real WETH locked on Ethereum Sepolia → Axelar GMP → a
Soroban `veil-pool` mints a shielded AVAILABLE note → browser-proved lock → borrow of real USDC from
`veil-vault`. There is **no reverse leg**: after a loan is repaid (or liquidated) the borrower's WETH
is stranded on Ethereum. `VeilEthLock` is lock-only, non-upgradeable, and no Soroban→Ethereum
outbound path exists. This spec designs the reverse leg — the authenticated "loan settled on Stellar"
signal that travels back to Ethereum and releases the WETH — for the **repay** path in v1 (liquidation-
release deferred, §2.6), using Axelar GMP symmetrically with the deposit leg. The transport is de-risked;
the once-open *shielded binding* between a settled position and its Ethereum-side escrow is **resolved by
B1′** (§2.5) — bind `C0` into the `lockId` derivation with a one-constraint change to the `lock` circuit.

---

## 1. Locked decisions (from brainstorming)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| Q1 | Scope | **Repay-release only in v1** (liquidation-release deferred) | The repay path is fully sound; §2.6 — liquidation-release is theft-proofable but *not economically live* in v1 (borrower-authored proof; an underwater borrower has no incentive to run it), so it moves to the shielded-pool milestone. **Re-decided during the spike** (was "both"); user confirmed defer, 2026-07-03. |
| Q2 | Trust model | **Axelar GMP symmetric** | Same `pay_gas`+`call_contract` primitives as the proven inbound leg; Amplifier mainnet-GA since Aug 2024; one trust anchor (Axelar validator set) both directions. Research-backed (LOW–MED risk). |
| Q3 | Privacy linkage | **Settlement-time linkage v1**; shielded WETH pool = stated next milestone | Under individual `C0` keying, revealing `C0` at release is unavoidable; the shielded-pool alternative is a much larger build that only *partially* helps (release amounts are public on Ethereum regardless). Privacy holds for the entire open-loan lifetime. |
| Q4 | Deploy scope | **Surgical**: new lock+release `VeilEthLock`, evolve `veil-pool`, **NEW `lock` verifier**, reuse vault + unlock/seize/borrow/deposit circuits+verifiers | Smallest change that works. **Updated by the spike:** B1′ *does* redeploy the `lock` verifier (the one sub-clause of "reuse everything" that flips); the note structure is unchanged so all other verifiers are reused. |
| — | Approach | **A — new `release_repaid` circuit that reveals `C0` and binds it to a settled position** | The deployed `unlock`/`seize` recover collateral only as an in-pool shielded note; they never reveal `C0`, so they cannot key an Ethereum release. |
| §2.5 | Binding | **B1′ — `lockId = Poseidon2(C0, r)`** (fold C0 into the lockId derivation) | Beats literal-B1 (which added a note field and broke unlock/seize) and B2 (accumulator: +a 3rd Merkle membership in-circuit + new pool state). B1′ = +1 Poseidon2 constraint, zero new pool state, `lock` circuit is the only circuit touched. See §2.5. |

---

## 2. Why the deployed Stellar side is NOT enough (the core finding)

The prior handoff assumed "the entire Stellar side of repay/liquidate is already built; the only gap
is releasing WETH on Ethereum." Reading the contracts, that is only half true.

The collateral chain, with on-chain visibility noted:

```
DEPOSIT   WETH locked on Ethereum keyed by commitment C0 ; pool inserts C0 as an AVAILABLE note
   │      (C0 + amount are PUBLIC: Ethereum Locked event + Stellar AttestLock event)
   ▼
LOCK      joinsplit spends C0 → mints LOCKED note C1 = commit(amount, spendPk1, blinding1, lockId)
   │      *** shares ONLY `amount` with C0 — C0 → C1 is deliberately UNLINKABLE (this is the privacy) ***
   ▼
BORROW    veil-vault position keyed by lock_handle = H1(lock_id) ; lock_handle is PUBLIC (borrow input)
   ▼
REPAY     vault appends repaid_leaf(lock_handle) → advances repaid_root
LIQUIDATE vault appends liquidated_leaf(lock_handle) → advances liquidated_root
   ▼
UNLOCK    spends C1 → mints a FRESH AVAILABLE note C2 ; public = [nf, C2, rootPool, rootRepaid]
SEIZE     spends C1 → liquidator note (public `seized`) + change note ; public has NO C0
```

**Consequence:** `unlock`/`seize` recover collateral as a *new shielded in-pool note*. They do not
reveal `C0` and cannot authorize releasing the `C0`-keyed WETH. The link between a settled position
(keyed by `lock_handle`) and the Ethereum escrow (keyed by `C0`) exists **only in the borrower's
secret witness**. Releasing the original WETH therefore needs a **new proof that re-establishes the
`C0 ↔ settled-position` binding** — the settlement-time linkage accepted in Q3.

### 2.5 ✅ THE BINDING PROBLEM — RESOLVED (B1′)

The release must fire **only if the loan that C0's collateral backs is settled**. A naive circuit —
"prove I own `C0`" + "prove I own *some* repaid LOCKED note `C1`" — is **insolvent**, because `C1`
shares only `amount` with `C0`, so "same amount" is the only thing tying them, and that is forgeable:

> **Attack:** Borrower deposits `C0_a` and `C0_b` (both 1 WETH). Locks/borrows/**repays** position A.
> Locks/borrows `C0_b`, leaves position B **active**. Runs release for `C0_b`, satisfying the "a
> repaid `C1` of amount 1" gate with position A's note → **releases collateral of an active loan
> while keeping the borrowed USDC.** Pool insolvency.

The binding of `C0` to its *own* locked position is therefore **necessary for solvency**, and it must
be **private during the open loan yet provable at release**:

- **Solvency** ⇒ the release circuit must prove `C1` is *the* lock of *this* `C0` (not any note of
  equal amount).
- **Open-loan privacy** ⇒ the binding must NOT be a deterministic public function of `C0`. (A
  tempting `lockId = f(C0)` fails: `lock_handle = H1(lockId)` is public at borrow, and `C0` is public
  at deposit, so an observer brute-forces `f(C0)` over all deposits and links borrow → deposit,
  destroying the Q3 "private during the open loan" property.)

**Decisive facts from reading the deployed circuits (`circom/lock.circom`, `note_commitment.circom`,
`contracts/veil-pool/src/lib.rs::lock`):**

1. The `lock` circuit **already recomputes `C0` in-circuit** as `cin.out` (the AVAILABLE input note).
2. It **already publishes** `nf0 = Nullifier(nk, C0, idx0)` and takes **`lockId` as a prover-chosen
   *public input* with no derivation constraint** (public order `[nf0, C1, root, lockId]`).
3. The note commitment is a **fixed 3-level structure** `C = H(H(H(amount,spendPk,ds),blinding,ds),
   aux, ds)` with `aux = lockId` for LOCKED notes. `unlock`/`seize`/`borrow` all recompute `C1` with
   `aux = lockId`, so **any change to the note structure breaks them.**

Fact (3) **kills the literal B1** from the original brainstorm (add a `bindC0` field →
`commit(...,lockId,bindC0)`): that changes the note structure and would force new unlock/seize/borrow
verifiers — contradicting B1's own "doesn't touch them" claim.

**Chosen mechanism — B1′ (refined B1): bind `C0` by constraining `lockId` itself.**

Add ONE private input `r` (secret random) to the `lock` circuit and ONE constraint:

```
lockId === Poseidon2(C0, r)          // C0 = cin.out is already in-circuit; r random ⇒ hiding
```

Nothing else in `lock` changes; `aux` is still `lockId`, so **the note structure is identical and
`unlock`/`seize`/`borrow`/`deposit` circuits + verifiers are byte-for-byte untouched.** Only the
`lock` circuit and its Soroban verifier are redeployed.

`release_repaid` then proves, over public `[nullifierC1, C0, recipient, rootPool, rootRepaid]`:
(a) `C1 = commit(amount, spendPk1, blindingIn, aux=lockId) ∈ rootPool`; (b) `spendPk1 = H1(nk1)`;
(c) publishes `nullifierC1` (pool `try_spend` → single-release); (d) `repaid_leaf(lock_handle(lockId))
∈ rootRepaid`; (e) **`lockId === Poseidon2(C0, r)`** (the binding, `C0` public); (f) binds `recipient`
into the proof (anti-redirect). `C0` is a public output → keys the Ethereum release.

**Solvency proof sketch.** To release `C0_b`'s escrow the circuit must reveal `C0 = C0_b` and exhibit
a *settled* `lockId` with `lockId = Poseidon2(C0_b, ·)`. In the attack the borrower has repaid A
(`lockId_a = Poseidon2(C0_a, r_a)`) and active B; the only settled handle is `lockId_a`. Forcing
`lockId_a = Poseidon2(C0_b, r′)` with `C0_a ≠ C0_b` is a Poseidon collision — infeasible. So
active-loan collateral cannot be released; the pool stays solvent. Double-release is blocked twice:
`try_spend(nullifierC1)` on the pool and `released[C0]` on Ethereum. ∎

**Privacy argument.** `lockId` is public at lock/borrow, but `Poseidon2(C0, r)` with secret random
`r` is a **hiding commitment to `C0`**: for any candidate deposit `C0'` there exists *some* `r'` with
`Poseidon2(C0', r') = lockId`, so an observer cannot link borrow→deposit without `r`. `C0` is revealed
only at settlement (accepted Q3). No leakage earlier than the deployed forward leg already has. ✓

**Circuit-constraint estimate.** The binding adds **one Poseidon2** (~250 R1CS) to `lock` and one to
`release_repaid` — negligible (~0.1%) beside the two Merkle memberships (`rootPool` + `rootRepaid`,
~`2·levels` Poseidon2) the release circuit needs regardless. `release_repaid ≈ unlock` in size
(`unlock_test.r1cs` ≈ 2.56 MB), which is already browser-provable. **B2 was rejected** precisely
because it adds a *third* Merkle membership (the `(nf0,C1)` accumulator, ~+50–70% constraints) plus
new pool state and per-lock writes — strictly heavier for the same guarantee.

**Deploy impact / Q4.** New `lock` circuit+verifier, new `release_repaid` circuit+verifier, evolve+
redeploy `veil-pool`. **Reused unchanged:** `deposit`, `borrow`, `unlock`, `seize` circuits+verifiers,
and `veil-vault`. Q4's "reuse the lock verifier" sub-clause **flips to false**; everything else in Q4
holds. The LIVE Phase-7 pool/verifiers are **left untouched** as the proven forward-leg artifact — the
reverse e2e re-locks on the NEW pool (already accepted; U10 is a fresh e2e).

> **Note — `lockId` uniqueness improves.** Today `lockId` is arbitrary prover choice; the vault keys
> positions by `lock_handle = H1(lockId)` and rejects duplicates. Under B1′, `lockId = Poseidon2(C0,
> r)` with a unique deposit `C0` + random `r` is unique w.h.p. — strictly stronger than the status quo.

**Rejected — B3 (re-key the escrow by `lock_handle`).** WETH is escrowed at deposit, before any lock
exists, so keying by the lock restructures the LIVE deposit leg. Out.

### 2.6 ✅ Liquidation recipient risk — RESOLVED by DEFERRAL

Both release paths are **borrower-authored** — any spend of `C1` needs the borrower's nullifier key
`nk` (a borrower secret). For **repay** this is natural and fully sound (the borrower releases their
*own* WETH to their *own* address; no third party, no redirection surface, strong incentive to run it).

For **liquidation**, reading `vault.liquidate` confirmed two compounding problems:

1. **Recipient integrity (theft — FIXABLE).** The `liquidator` pays the full USDC debt and is
   `require_auth`'d on-chain, but that identity is used *only* for the USDC pull — it is **not** written
   into the liquidated leaf or position. The borrower-authored `seize`/release freely chooses
   `liquidatorPk`/`recipientLiquidator`, so a malicious borrower can redirect the `seized` WETH to
   themselves. *Fixable* by binding the liquidator's EVM recipient on-chain at `liquidate`
   (fold it into the liquidated leaf, `liquidated_leaf = H(lock_handle, recipient_evm)`, so the
   seize+release proofs are forced to output exactly that recipient).
2. **Liveness (ARCHITECTURALLY FUNDAMENTAL — not fixable in v1).** Even theft-proofed, *only the
   borrower* can produce the proof. A fully-underwater borrower (`change ≈ 0`) gains nothing from
   running release, so the liquidator who already paid the debt may **never** receive the WETH —
   precisely in the case where liquidation matters most. Closing this requires letting someone other
   than the borrower spend `C1`, i.e. the **shielded-WETH-pool redesign** (Ethereum-side nullifiers /
   fungible escrow) — a separate, much larger milestone. The protocol stays *solvent* regardless (LPs
   are made whole at `liquidate`); only the liquidator bears uncompensated risk.

**DECISION (user, 2026-07-03): defer liquidation-release to the shielded-WETH-pool milestone. v1 ships
the repay-release path only.** Rationale: (1) the liveness gap is architectural, so even a perfect
recipient-binding leaves liquidation economically unsound for third-party liquidators; (2) repay-release
is a complete, fully-sound cross-chain round-trip on its own (lock → borrow → repay → WETH released);
(3) the deployed **in-pool `seize`** already tells the liquidation story on Stellar (the liquidator
receives an in-pool claim) — only the cross-chain WETH *release* for defaults waits. This re-opens Q1's
"both paths"; the honest next-milestone framing (Q3) already names the shielded WETH pool, which is
exactly where liquidation-release belongs.

**Consequence for this spec:** `release_liquidated.circom`, the seize-side recipient binding, and any
`vault.liquidate` change are **OUT OF SCOPE for v1** (moved to §6). No vault change is needed for the
repay path — `vault.repay` already advances `repaid_root`, which the release proof gates on.

---

## 3. New/changed components (v1 = repay-release; B1′ binding)

### 3.1 Circuits

**`lock.circom` (MODIFY — the only touched existing circuit).** Add one private input `r` and one
constraint `lockId === Poseidon2(C0, r)` where `C0 = cin.out` (already computed). Public signals,
witness shape of `amount/blinding/spendPk/nk/…`, `aux = lockId`, and the emitted `nf0`/`C1` are all
unchanged, so **the note structure and the unlock/seize/borrow/deposit circuits stay identical.**
Recompile → new zkey/VK → **new Soroban `lock` verifier**. Re-vendor `web/public/circuits/lock/`.

**`release_repaid.circom` (NEW).**
- **Public:** `nullifierC1`, `C0`, `recipient` (borrower EVM address, field-encoded), `rootPool`, `rootRepaid`.
- **Private:** `amount`, the `C1` opening (`spendPk1`, `blindingIn`, `lockId`, `nk1`, `leafIndexC1`,
  `pathElements`), the **binding witness `r`**, `repaidLeafIndex`, `repaidPathElements`.
- **Proves:** (a) `C1 = commit(amount,spendPk1,blindingIn,aux=lockId) ∈ rootPool`; (b) ownership
  `spendPk1 == H1(nk1, DS_NK)`; (c) publishes `nullifierC1 = Nullifier(nk1, C1, leafIndexC1)`;
  (d) `repaid_leaf(lock_handle(lockId)) ∈ rootRepaid` (mirrors `unlock`'s DS_LOCK→DS_REPAID gadget);
  (e) **`lockId === Poseidon2(C0, r)`** (§2.5 binding, `C0` public); (f) binds `recipient` (a
  constrained public input the pool echoes into the Axelar payload — anti-redirect, and defends the
  proof against `recipient` malleability). Effect: release the **full** `C0` WETH to `recipient`.

Compile → zkey/VK → deploy a Soroban Groth16 verifier → vendor to `web/public/circuits/release_repaid/`
→ wire a browser prover (mirror `web/lib/prove/` unlock/lock shape).

> **Do NOT touch** the deployed `deposit_from_eth`, `borrow`, `unlock`, `seize` circuits/verifiers, or
> `veil-vault`. `lock` IS modified (B1′). `release_liquidated.circom` is **deferred** (§2.6, §6).

### 3.2 `veil-pool` (evolve → redeploy)

- **New entrypoint** `release_repaid(proof, nullifierC1, C0, recipient, rootPool, rootRepaid)`: verify
  the release proof (public order `[nullifierC1, C0, recipient, rootPool, rootRepaid]`), `require_canonical`
  each field (as `lock`/`unlock` do), assert `known_root(rootPool)` and `rootRepaid == vault.repaid_root()`
  (no stale root, mirroring `unlock`), `try_spend(nullifierC1)` (single-release, as `unlock`/`seize`),
  then emit the Axelar outbound message. `pay_gas` + `call_contract` run in the SAME tx so an emit
  failure reverts the nullifier spend (atomic — no "note burned but WETH never released" state).
- **B1′ lock-verifier swap:** wire the **new** `lock` verifier address (new `ConfigKey` or reuse the
  existing `LockVerifier` slot at redeploy). `lock`'s pool-side logic is unchanged (still
  `[nf, C, root, lockId]`); only the verifying key changes.
- **Outbound Axelar:** extend the gateway client trait with `call_contract`; add an `AxelarGasService`
  client (`pay_gas`) + gas-service address + gas-token config (new one-time `ConfigKey`s, mirroring
  `set_eth_lock`). Payload = `abi.encode(C0, recipient)`. Destination = pinned `VeilEthLock` string,
  chain = `ethereum-sepolia`.
- Redeploy the pool; re-wire the vault's `veil_pool` config + set the two Axelar config keys (surgical).
  Reuse `veil-vault`, the `borrow`/`unlock`/`seize`/`deposit` verifiers, and their circuits unchanged.

### 3.3 `VeilEthLock` v2 (new Sepolia contract)

- `lock(...)` — WETH escrow keyed by `C0` (re-deployed so one contract owns both legs; the B1′ binding
  lives in the *Stellar* `lockId`, not here — the Ethereum escrow stays keyed by the public `C0`).
- `_execute(sourceChain, sourceAddress, payload)` (`IAxelarExecutable`):
  - **Guards:** the reverse source is Stellar → assert `sourceChain == <current Stellar Amplifier
    chain name>` (e.g. `stellar-2026-q1-2`; re-verify via `getChains` at deploy) **and**
    `sourceAddress == <pinned veil-pool address string>`. Axelar-level replay via the gateway +
    a contract-level `released[C0]` guard (no double-release).
  - **Effect:** decode `(C0, recipient)`; transfer the **full** escrowed WETH for `C0` to `recipient`;
    set `released[C0] = true`.
- Old `VeilEthLock` (`0xE114C79D…`) abandoned; its 0.002 testnet WETH stranded (no withdraw path;
  worthless).

### 3.4 Web (`web/`)

- **Circuits:** re-vendor `lock/` (new zkey/VK from the B1′ recompile) + vendor `release_repaid/`; add
  a client prover for release (mirror `web/lib/prove/` unlock/lock shape). The lock witness builder
  gains the new `r` input (persisted with the note so release can reconstruct the binding).
- **Pipeline:** a resumable reverse pipeline — repay: `vault.repay` → build release witness (from the
  stored note + `r`) → prove → `pool.release_repaid` → wait Axelar (~a-few-to-15 min, resumable) →
  observe WETH released on Sepolia.
- **Components:** rebuild `RepayFlow` (deleted in U7); extend the `NoteCard` lifecycle with
  `repaid`/`released` states + step progress. **No `LiquidateFlow`** (deferred).
- **Copy:** flip the honest "repay-to-unlock is the next milestone" framing (added in the U8 critical
  review) to the now-live repay-release; keep the shielded-WETH-pool line — now explicitly also the
  home of **liquidation-release** — as the stated next milestone.

---

## 4. Trust & privacy properties

- **Trust anchor:** Axelar validator set, **both directions** — symmetric to the proven deposit leg.
  No trusted relayer/state-root poster on the critical path.
- **Privacy:** the position is private for its entire open-loan lifetime; `C0` is revealed only at
  settlement (accepted Q3 linkage). The binding (§2.5) must not leak `C0` before settlement. The
  **shielded WETH pool** (fungible escrow + Ethereum-side nullifiers) is the documented next
  milestone that would close settlement-time linkage.
- **Amounts:** the WETH amount is already public from the deposit; release reveals nothing new.
  `seized` is public by construction; `change` is derivable — no extra loss at release.

---

## 5. Failure modes to defend (from research + contract reading)

1. **Binding unsoundness (§2.5)** — the dominant risk; **resolved by B1′** (`lockId = Poseidon2(C0, r)`).
   Test target: the "release active-loan collateral via a repaid same-amount note" attack MUST fail.
2. **Liquidation recipient redirection (§2.6)** — **avoided by deferring** liquidation-release; not in v1.
3. **Destination-address string format** — docs say EVM address w/o `0x`; the Stellar reference passes
   *with* `0x`. Unresolved → **test empirically** on the live route before wiring release.
4. **Under-funded `pay_gas`** — message approved but not auto-executed on Sepolia → generous testnet
   gas + Axelarscan manual re-execution fallback (the pool tx is atomic, so no lost-note risk).
5. **Double-release** — `released[C0]` (Ethereum) + `try_spend(nullifierC1)` (pool): two guards.
6. **Source pinning** — `_execute` validates the Stellar chain name + pinned pool string; the pool
   validates the vault's *current* settlement root (no stale root).
7. **Chain-name rotation** — Stellar Amplifier chain name rotates quarterly; resolve via `getChains`
   at deploy, never hardcode.
8. **Latency** — reverse hop ~a-few-to-15 min (EVM finality). Narrate in the UI; pipeline resumable.
9. **Unit consistency** — note `amount` (WETH raw, 18 dp) vs the split units at release; verify no
   truncation/aliasing in `seized`/`change`.

---

## 6. Explicitly out of scope (this spec)

- **Liquidation-release (the whole cross-chain default path):** `release_liquidated.circom`, the
  seize-side recipient binding, the `liquidated_leaf = H(lock_handle, recipient_evm)` change, and any
  `vault.liquidate` change. **Deferred to the shielded-WETH-pool milestone** (§2.6). The in-pool
  `seize` (deployed) is the liquidation story on Stellar for now.
- Shielded WETH pool (fungible escrow + Ethereum nullifiers) — **stated next milestone**, and the home
  of liquidation-release.
- Migrating the stranded 0.002 testnet WETH — impossible (no withdraw path); abandoned by design.
- Any change to the deployed `deposit`/`borrow`/`unlock`/`seize` circuits/verifiers or `veil-vault`.
  (`lock` **is** modified under B1′; that is in scope.)
- U10 (live forward e2e) and U11 (cleanup + demo) — separate units of the parent 11-unit plan.

---

## 7. Open items

**Resolved by the spike (2026-07-03):**
- ✅ **§2.5 binding** — **B1′** (`lockId = Poseidon2(C0, r)`). Solvency + privacy proven; +1 Poseidon2;
  Q4's reuse-lock-verifier sub-clause flips to *new lock verifier*, all else reused.
- ✅ **§2.6 liquidation recipient** — **deferred** liquidation-release to the shielded-pool milestone.
- ✅ **One release circuit** (`release_repaid`) in v1 — the two-circuit/selector question is moot now
  that liquidation is deferred.
- ✅ **`veil-vault` needs no change** — `repay` already advances `repaid_root`; the release proof gates
  on it. (The `liquidate`-time recipient binding that *would* have changed the vault is deferred.)

**Still to settle DURING `writing-plans` / implementation (not blockers):**
- Exact `ConfigKey` additions + one-time setters for the Axelar gas service + gas token.
- Whether the new `lock` verifier reuses the existing `LockVerifier` config slot or a new one.
- The field-encoding of the borrower EVM `recipient` as a BN254 public input (mirror the vault's
  `BN254_R`-reduction pattern for the borrower binding).
- Re-verify the current Stellar Amplifier chain name + gateway via `getChains` immediately before deploy.
- LP top-up / fresh-deploy decision for the live reverse e2e (coordinate with U10).
- Persisting the new lock witness `r` in the encrypted note vault so release can rebuild the binding.

---

## 8. Provenance

- Contracts read (spike, 2026-07-03): `contracts/veil-pool/src/lib.rs` (`execute`, `lock`, `unlock`,
  `seize`, `deposit`), `contracts/veil-pool/src/notes.rs` (note/nullifier/leaf model + domain seps),
  `contracts/veil-vault/src/lib.rs` (`borrow`, `repay`, `liquidate` — confirmed the liquidator identity
  is `require_auth`'d but not recorded into the leaf), `circom/{lock,unlock,seize,note_commitment,
  nullifier}.circom` (confirmed `lock` recomputes `C0`, publishes `nf0`, takes `lockId` as an
  unconstrained public input; note commitment is a fixed 3-level structure — the facts that pick B1′).
- Research brief: Axelar Soroban→EVM outbound GMP maturity (production-viable, LOW–MED risk;
  `stellar-gmp-example`; `pay_gas`+`call_contract`; `getChains` for live identifiers).
- Prior handoff: `docs/context/conversation_2026-07-03_0229.md`.

---

## 9. Recommended next step

**Ready for `writing-plans`.** The binding-design spike is complete: §2.5 → **B1′**, §2.6 → **defer
liquidation-release**, and the outcome is folded into §1/§2.5/§2.6/§3/§5/§6/§7. The v1 build order:
`lock.circom` (+`r`) → `release_repaid.circom` → new Soroban `lock` + `release_repaid` verifiers →
evolve+redeploy `veil-pool` (release entrypoint + outbound Axelar) → `VeilEthLock` v2 (`_execute`
release) → web (re-vendor lock, vendor release, reverse pipeline, `RepayFlow`) → live reverse e2e.
