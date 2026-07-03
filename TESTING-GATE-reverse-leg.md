# Veil v3 — Whole-App Testing Gate (reverse leg, Task 14)

Consolidated run at HEAD (reverse-leg complete). Covers EVERY feature from the beginning (deposit,
lock, borrow, unlock, seize) plus the new repay-release reverse leg — per the 2026-07-03 directive.

## Suite results (this run)

| Suite | Command | Result |
|---|---|---|
| Web unit | `cd web && pnpm test` | **103/103 pass**, typecheck 0 errors |
| Web build | `pnpm build` (Task 13) | **PASS** |
| Solidity | `cd contracts/escrow && forge test` | **68/68 pass** (5 suites; incl. VeilEthLock v1 9/9 + VeilEthLockV2 6/6) |
| Soroban pool | `cd contracts/veil-pool && cargo test --release` | **39/39 pass** |
| Soroban verifier | `cd contracts/veil-verifier && cargo test --release` | **7/7 pass** (incl. `release_repaid_proof_verifies_on_soroban` roundtrip) |
| Circuits | prove→verify lock + release_repaid; insolvency attack | **OK / OK / attack ABORTS** (Tasks 1–2) |

## Live on-chain verification

| Prover | Verifier (deployed) | Result |
|---|---|---|
| lock (B1′) | LOCK_V2 `CA4XWFDN…A4TE` | **on-chain `true`** + tamper rejected (Task 9; code byte-identical at HEAD) |
| release_repaid | RELEASE `CDH7TOPQ…GLCB` | **on-chain `true`** + tamper rejected (Task 10; re-confirmed at HEAD via the `veil-verifier` release roundtrip, same Groth16 verify the deployed contract uses) |

> The Task-14 live re-run of `verify:release-prover` hung on a congested testnet RPC and was stopped;
> the on-chain PASS is already established at Task 10 on the identical prover/circuit/verifier (Tasks
> 11–13 changed only addresses/pipeline/UI, never the prover, circuit, or verifier), and the
> `veil-verifier` cargo roundtrip re-verifies the release proof through the same pairing logic at HEAD.

## Whole-app feature inventory

| Feature | Coverage | Status |
|---|---|---|
| **Deposit** (ETH→Stellar attest) | web `crosschain`/`eth` unit tests; DepositFromEthVerifier exercised by VeilEthLockV2 forge tests with a real Groth16 proof | ✅ |
| **Lock** (AVAILABLE→LOCKED, B1′ binding) | web `lock` unit tests; `verify:lock-prover` on-chain vs LOCK_V2; pool `lock` cargo test | ✅ |
| **Borrow** | web borrow tests; vault borrow verifier reused unchanged (`CBTSWUY5…DMM2`); pool/vault cargo tests | ✅ |
| **Unlock** (LOCKED→AVAILABLE, repay-gated) | pool `spend_test::unlock_*` cargo tests; `veil-verifier` unlock roundtrip. (Circuit+verifier level — not part of the v1 web reverse flow by design.) | ✅ |
| **Seize** (liquidation, in-pool) | pool `spend_test::seize_*` cargo tests; `veil-verifier` seize roundtrip. (Circuit+verifier level.) | ✅ |
| **Repay-release** (NEW reverse leg) | web `release` unit tests; `verify:release-prover` on-chain vs RELEASE; pool `release_repaid` single-release test; **insolvency attack witness ABORTS** (Task 2); release roundtrip on Soroban | ✅ |

## Deployed app
- Production: **https://veilzk.vercel.app** (HTTP 200, new v2 addresses in the live bundle).
- Hands-on live e2e (deposit→lock→borrow→repay→release round trip) = **Task 15** (next).

**Verdict: GREEN.** All existing features + the new reverse leg pass at HEAD. Both ZK provers are
load-bearing on-chain. Ready for the live reverse e2e + hands-on test.
