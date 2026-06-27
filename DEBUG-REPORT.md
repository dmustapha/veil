# DEBUG REPORT — Veil

## Executive Summary
- **Generated:** 2026-06-26
- **Mode:** full (deadline ~2.9 days)
- **Confidence Score:** 92 (live re-validation of the fixed guest/vault PASSED)
- **Unresolved Issues:** 0. Live re-validation complete: fixed-guest real proof (image_id c1fb4c3a)
  verified by the real BN254 verifier on the hardened vault `CBICAWGA…GILV`, disbursed 1.97 USDC
  (tx `026d4af6…`); tampered proof reverts. Recommendation: **PROCEED to wire/verify_milestone.**
- **Security Findings:** CRITICAL: 1 (FIXED) · HIGH: 1 (subsumed by the critical fix) · MEDIUM: 3 (2 fixed, 1 by-design-disclosed) · LOW: 3 (verified-clean / accepted)
- **Test Coverage:** escrow 12/12, vault 11→12/12 (added freshness test), guest dev-mode pass
- **Recommendation:** PROCEED after the in-flight re-prove + live re-borrow confirms the fixed chain (then 90+).

## Baseline (Phase 1)
- escrow (foundry): 12/12 pass · vault (cargo): 11/11 pass (→12 after fix) · guest dev-mode: pass
- Compilation: all green. Test:source ratio healthy (23 cases over ~6 core sources).

## The CRITICAL finding (Phase 5/6 — security audit) — FIXED
**[C-01] Guest did not bind `amount_slot` to the loan hashlock `H`.** The guest proved "*some*
storage slot of the escrow holds ≥ threshold" — `amount_slot` was a free prover witness, never
checked against `keccak256(abi.encode(H,0))+1`. Exploit: a borrower proves the threshold against
any large slot (another lock, any account) and mints an **unbacked loan**. The proof attested the
wrong statement — the load-bearing bug.
**Fix** (`guest/methods/guest/src/main.rs`): derive the expected slot from `hashlock` in-circuit and
`assert!(amount_slot == keccak256(H‖0)+1)`. The guest now proves `locks[H].amount ≥ threshold`.
Verified: the real Sepolia fixture still satisfies the assertion (its slot *is* `locks[H].amount`);
journal unchanged. Image_id changed → re-proved on CI, vault re-deployed with the new image_id.

## Other findings + dispositions
| ID | Sev | Finding | Disposition |
|----|-----|---------|-------------|
| C-02 | HIGH | account/hashlock not tied to slot | SUBSUMED by C-01 (slot derived from committed H binds them) |
| M-04 | MED | borrow wrote state after USDC transfer | FIXED — CEI reorder (nullifier+loan before transfer) |
| M-02 | MED | Reflector price staleness unchecked | FIXED — reject price older than MAX_PRICE_AGE_SECS (24h) |
| Fresh | MED | borrow accepted any posted checkpoint (stale-root) | FIXED — MAX_BLOCK_AGE freshness guard + LatestBlock tracking + test |
| host | LOW | `receipt.verify` result discarded | FIXED — gated to assert in real-proving mode |
| relayer | MED | secret parsing fragile (demo path) | FIXED — defensive line/regex parse |
| M-03 | MED | escrow.deadline vs loan term not enforced on-chain | ACCEPTED/DISCLOSED — off-chain set; SCOPE §9 trust; documented |

## Verified-clean (audit confirmed safe)
- Journal encode/decode byte-identical across guest/core, vault journal.rs, host (offsets 0/32/40/60/76/108/140).
- Proof↔journal binding: vault hashes the exact journal bytes it decodes; verified proof is bound to it.
- Escrow reentrancy: nonReentrant + CEI (`closed=true` before `_send`) holds; empty-slot collision defended.
- Nullifier domain-separated (`veil-null`‖escrow‖H); checkpoint admin-gated; borrower auth enforced.
- Loan sizing math sound for realistic ranges (1 ETH@$1500@50% = 750 USDC; ≤1000 ETH stays in i128).
- Honesty: no "trustless" claims; `liquidatePrice` honestly reverts as a stretch; SCOPE §12 respected in code.

## Edge cases / E2E (Phases 3-4)
Already proven live end-to-end pre-debug (E2E-LIVE.md): lock→prove→borrow→repay→cross-chain-unlock,
plus cheat-fails (tampered proof rejected by the real BN254 verifier). Re-validation of the FIXED
guest+vault on testnet is the one open item (CI re-prove → redeploy → real borrow).

## Confidence Justification
The single critical soundness bug is fixed at the root (in-circuit slot binding) and re-verified
against real data; all cheap hardening applied; tests green (escrow 12, vault 12). Holding at 88
until the fixed chain is re-borrowed live on testnet, which lifts it to 90+.
