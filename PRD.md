# Veil — PRD

> Authoritative spec: `SCOPE.md` (locked charter) + `ARCHITECTURE.md` (build spec). This PRD
> consolidates the user flows, feature list, demo script, and observables for downstream phases
> (stress_test, demo, package). Where this conflicts with SCOPE.md, SCOPE.md wins.

## 1. Product (one line)
Borrow USDC on Stellar against collateral you keep on Ethereum, proving you are good for it with a zero-knowledge proof that keeps your exact amount and Ethereum wallet off the Stellar ledger (the hashlock is public on both chains, so Ethereum-side unlinkability is named future work — SCOPE §12). The collateral never bridges; the proof, not a relayer, is what Stellar trusts.

## 1.3 User Flows
1. **Borrow (hero flow):** lock collateral in the Sepolia escrow → generate a RISC Zero proof that `locks[H].amount ≥ threshold` (amount + address private) → Soroban vault verifies the Groth16 proof on-chain and disburses real Circle USDC sized by the Reflector price → the Stellar ledger only ever sees `{threshold, hashlock, nullifier, proof}`.
2. **Repay → unlock:** repay USDC on Stellar (reveals secret S) → secret-relayer submits S to the Sepolia escrow `claimRepaid(S)` → collateral returns to the depositor.
3. **Default:** timeout (or price) path on Ethereum sends collateral to the lender. No Stellar→Ethereum proof needed.
4. **The cheat that fails (load-bearing):** a forged proof is rejected by the on-chain BN254 verifier (`Error(Crypto, InvalidInput)`); a replayed valid proof is rejected by the nullifier set (`Error(Contract, #7 NullifierUsed)`). No USDC moves in either case.

## 1.4 Features (all SHIPPED — see VERIFY-REPORT.md milestone)
- Sepolia escrow: lock + hashlock + 3 exits (repay-reveal, timeout→lender, price stub).
- RISC Zero privacy guest: Ethereum amount + address private witnesses; commits only `{state_root, block, escrow, threshold, hashlock, nullifier, recipient}` (recipient = keccak256 of the borrower's Stellar account, binding the loan to one redeemer).
- Soroban vault: atomic verify→disburse of real Circle USDC; nullifier replay-protection; Reflector loan sizing; repay; timeout liquidation; freshness + staleness guards.
- Real Groth16 verifier on Soroban (BN254, P25/P26 host functions).
- Relayers: checkpoint poster (disclosed trust) + secret-reveal.
- Thin client (web/): `/` landing + `/app` live workspace (MetaMask + Freighter connect, live position reads, the verify-flip, the live cheat-fail).

## 1.5 Feature observables (for stress_test / verify)
- `/api/state` returns live vault config + loan + Reflector price + escrow lock; amount NEVER present (privacy invariant). Sentinel-fail: any field exposing the real collateral amount, or all-zero/null loan when a loan exists.
- `/api/cheat` returns the real `Error(Crypto, InvalidInput)` trap from a live tampered-proof simulation. Sentinel-fail: returns success / no error / fabricated error.
- On-chain: tampered proof → `Error(Crypto, InvalidInput)`; replay → `Error(Contract, #7 NullifierUsed)`; stolen proof redeemed by another account → `Error(Contract, #17 WrongRecipient)`; valid proof → 1.97 USDC disbursed (tx dc5c1719…).
- UI: the collateral amount renders only as `▓▓▓ hidden` + `≥ 0.005 ETH (threshold)` everywhere.

## 1.6 Demo script (2-3 min, from SCOPE §10)
1. Lock on Sepolia (real tx). 2. Generate the private proof (real artifact; amount never shown). 3. Verify on Stellar → vault disburses real USDC (real tx); "Groth16 verified on Soroban, amount hidden". 4. The cheat that fails: forged proof → Soroban rejects, no USDC (red). 5. Repay → reveal S → unlock the Sepolia collateral. Only the state-root poster is trusted-not-mocked; the README says so.

## 1.7 Honesty guardrails (SCOPE §12)
Not "trustless" (checkpoint + oracle + timeout trusted). Not "we removed the bridge". Not audited/production. Privacy shipped = Stellar-side confidentiality; full unlinkability (hiding the public hashlock correlation) is future work.

## Live deployments
See `DEPLOYMENTS.md` / `WIRE-REPORT.md`. Escrow `0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F` (Sepolia), vault `CDPYUWKD5OTYVWK6C3FQC2OEB3XK4DRAI7WJ5C3XQW6TY3UV2JQWFX2D`, verifier `CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L` (Soroban testnet).
