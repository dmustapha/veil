# Veil — Live End-to-End Run (real testnets)

> ⚠️ **SUPERSEDED (historical bring-up cycle).** This page documents an EARLY cycle that ran
> against the now-retired vault `CBK7UNIO…` with an interim **mock** verifier, before the real
> Groth16 verifier was wired and the guest slot-binding bug was fixed. **It does not describe the
> shipped system.** For the current, real on-chain facts — real RISC Zero Groth16 verifier
> (`CDZRHQMX…FP5E5C2L`), current vault (`CDPYUWKD…WFX2D`, borrower-bound 172-byte journal), guest
> image_id (`0x494bfee7…`), and the real borrow tx `dc5c1719…` — see **README.md** and the
> "Post-rebake" section of **DEPLOYMENTS.md**. The numbers below (3.945 USDC, 50% LTV, mock
> verifier) are from the superseded cycle and are intentionally left as a build record.

A full cross-chain borrow→repay→unlock cycle on **real** Sepolia + Soroban testnets, with **real
Circle USDC**, **live Reflector pricing**, a **real `eth_getProof`**, and the cross-chain secret
relay. In this superseded cycle the proof verifier was still the interim **mock**; the shipped
system replaced it with the real RISC Zero Groth16 verifier (proven in Phase 0a, wired at 0b).

## The cycle (every step is a real on-chain tx)
| # | Step | Chain | Result | Tx |
|---|------|-------|--------|----|
| 1 | Lock 0.01 ETH under hashlock H | Sepolia | collateral custodied | `0x41d0d7f1…71df9f` |
| 2 | Guest proves amount ≥ threshold (amount hidden) | off-chain | 140-byte journal | (dev-mode, `guest/PHASE-2-RESULT.md`) |
| 3 | Checkpoint posted (block 11143924 → state_root) | Soroban | vault binds Eth state | `d961df55…` |
| 4 | **borrow**: verify proof + disburse USDC (atomic) | Soroban | **3.945 USDC → borrower** | `50e3edb4…aa4f44` |
| 5 | repay: return principal + reveal secret S | Soroban | loan.repaid=true, S stored | `a1343bfe…3369bf0` |
| 6 | secret relay: S → escrow.claimRepaid(S) | Sepolia | **collateral unlocked (closed=true)** | `0x93464ef2…fd7824` |

## Numbers that line up
- Reflector ETH price: $1580.21 → loan = 0.005 ETH × $1580.21 × 50% LTV = **$3.945** = `39451931` (7-dec USDC). Matches the disbursed amount exactly.
- Balances moved: borrower 5.0 → 8.945 USDC on borrow, vault 15.0 → 11.055; repaid back on step 5.
- Loan record: nullifier `ee691cef…` set (replay-protected), threshold 5e15 wei (amount never on-chain).

## What this proves
The whole product works on live infrastructure: a proof gates real USDC atomically, the loan is
sized by a real oracle, and default/repay enforcement is real and cross-chain — with the Ethereum
amount + identity absent from every Stellar transaction. Phase 0b swaps the mock verifier for the
real RISC Zero Groth16 verifier (one address change; the verifier itself is already proven in 0a).

## Addresses
See `DEPLOYMENTS.md`. Vault `CBK7UNIO…MAJ2`, escrow `0xb833ff…bd6f`, mock verifier `CAMAIMZB…JY2C`.
