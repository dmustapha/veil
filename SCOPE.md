# SCOPE (LOCKED) — Eclipse: Private Cross-Chain Collateral Credit on Stellar
Working name: Eclipse (forge finalizes branding). Date: 2026-06-26. Deadline: 2026-06-29 19:00 UTC (~2.5 days). Builder: Claude Code (autonomous); user oversees.
Every line tagged with verification status: [VERIFIED] source-confirmed this session · [SOLVED] design-resolved · [GATE] proven only by the spike · [DISCLOSED] honest trust/WIP.

---

## 1. Product (one line)
Borrow USDC on Stellar against collateral you keep on Ethereum, proving you are good for it with a zero-knowledge proof that hides the exact amount and your Ethereum identity. The collateral never bridges; the proof, not a relayer, is what Stellar trusts.

## 2. The problem we solve
Your capital is stranded on the chain it sits on. To use Ethereum capital on Stellar's cheap rails today you either bridge it (the hackable trusted-relayer model) or sell it. And on a transparent ledger, even a trust-minimized version would force you to publicly reveal your Ethereum wallet and exact holdings to borrow, broadcasting your net worth and linking your two identities forever. [VERIFIED problem framing]
A bank never has this: it holds all your assets in one ledger. Cross-ledger collateral with no trusted intermediary AND without doxxing your position exists only because of multi-chain crypto. [SOLVED: ecosystem-native, passes "would a bank have this"]

## 3. Who the users are
Holders of meaningful Ethereum collateral (whales, funds, treasuries, DeFi power users) who want stablecoin liquidity on Stellar without (a) bridging their assets, (b) selling, or (c) revealing their Ethereum wallet and position to a Stellar lender and the public. Honest caveat [DISCLOSED]: these users are largely not on Stellar yet, partly because this does not exist. Real-in-principle, latent demand. Same institutional-privacy logic that makes confidential payments real, here fused with cross-chain.

## 4. What the product does (the output)
- A borrower locks collateral in an Ethereum escrow.
- They generate a zk proof that the escrow holds at least a threshold, with the exact amount and their Ethereum address kept secret.
- A Stellar Soroban contract verifies the proof on-chain and issues a USDC loan sized to the threshold.
- Repaying on Stellar reveals a secret that unlocks the Ethereum collateral; defaulting lets the lender claim it on Ethereum.
Output a judge sees: a real cross-chain loan where the proof gates real money and the borrower's Ethereum amount/identity never appear anywhere.

## 5. Why the ZK is load-bearing (the whole reason this passes)
The amount and Ethereum address are PRIVATE witnesses; the proof commits only {state_root, block_hash, threshold_met, nullifier, hashlock}. [VERIFIED: SP1/RISC Zero io::read=private vs io::commit=public]
Delete the ZK and you must reveal your exact Ethereum holdings and wallet to borrow, so the private-borrowing product is gone. And direct verification cannot hide anything, so only a SNARK can do this. The proof is irreducible. (This is the fix for the VRF-style "deletable ZK" trap: the load-bearing work is the PRIVACY, which native Merkle verification cannot provide.)

## 6. The architecture + tech stack (all verified)
zkVM: RISC ZERO (chosen over SP1). [VERIFIED] Reason: Nethermind's stellar-risc0-verifier already does BN254 Groth16 verification on Soroban with tests, CI, and an official Stellar testnet tutorial, so the riskiest half (zkVM-proof-verified-on-Soroban) uses known-good code. SP1 has easier off-the-shelf storage guests (crosschain-alliance/sp1-eth-get-proof-verifier, across/sp1-helios) but its Soroban verifier would have to be ported blind. SP1 is the documented fallback.
- Ethereum (Sepolia) escrow contract: locks collateral under hashlock H; three exits all checkable on Ethereum alone [SOLVED]: (1) repay-reveal S (borrower reclaims), (2) price-default via a Chainlink/Pyth feed (anyone liquidates to lender), (3) timeout to LENDER. Timeout must favor the lender, never the borrower (or the borrower keeps loan + collateral).
- RISC Zero guest: verifies an eth_getProof account+storage proof against a checkpointed state root, in plain Rust via alloy-trie + keccak (precompile, no million-constraint circuit) [VERIFIED]; amount + address PRIVATE; commits threshold_met + nullifier + H + state_root + block_hash. Wraps to Groth16-BN254 (~260 bytes) [VERIFIED].
- Soroban side: fork/use Nethermind's RISC Zero verifier (or a BN254 Groth16 verifier) [VERIFIED host functions sufficient: P25 bn254_g1_add/mul/multi_pairing_check + P26 g1_msm/Fr-arithmetic]; plus a purpose-built minimal lending vault (Blend cannot take external collateral [VERIFIED: three contract-level walls]) that custodies real Circle testnet USDC [VERIFIED: issuer GBBD47IF..., SAC CBIELTK6...], borrow() gated on the verified proof + records nullifier and H, sizes the loan via Reflector ETH/USDC price [VERIFIED live on testnet], repay() that reveals S, liquidate_on_timeout().
- Off-chain: a checkpoint relayer that posts canonical Ethereum state roots to the Soroban contract [DISCLOSED trust]; a thin client (Freighter on Stellar, MetaMask on Sepolia) and a secret-reveal relay.

## 7. Deepest integration (load-bearing, not bolted-on)
- Real Circle USDC via the Stellar Asset Contract: the proof gates movement of actual testnet USDC. [VERIFIED]
- Native BN254 host functions: on-chain proof verification is the core, not a side-check. [VERIFIED]
- Reflector oracle for loan sizing on Stellar. [VERIFIED live]
- Liquidation enforcement on Ethereum (Chainlink/Pyth + timeout) so no Stellar->Ethereum return proof is ever needed. [SOLVED]
- Optional deeper twist [GATE/stretch]: authorize borrow() through a Soroban custom account whose __check_auth runs the verifier, making the proof the authorization itself.

## 8. Liquidation (the thing that usually kills cross-chain lending) [SOLVED]
Enforcement lives where the collateral lives = Ethereum. Stellar is only a signal source, never an actuator. Repayment on Stellar reveals S; anyone relays S to the Ethereum escrow to unlock. Default = Ethereum-side price (oracle) or timeout, both checked on Ethereum. No Stellar-to-Ethereum proof (the genuinely infeasible part) is ever required. This is real, not mocked.

## 9. Residual trust, stated plainly (we never say "trustless") [DISCLOSED]
1. The state-root poster (checkpoint) - the big one; light-client replacement is named future work.
2. The Ethereum-side price oracle for liquidation.
3. Reflector for loan sizing.
4. The timeout parameter set sanely.
5. Unaudited verifiers, testnet, demo-grade.
Honest one-liner: "trust-minimized cross-chain borrowing, the collateral proof is cryptographic and the amount is hidden, default enforcement is non-custodial on Ethereum; we trust a checkpoint, an oracle, and a timeout." The ZK load-bearing privacy holds regardless of how the root is sourced.

## 10. The demo (2-3 min, screen-only, real vs simulated tagged)
1. Lock on Ethereum Sepolia [REAL Sepolia tx] - borrower locks collateral in the escrow; show Etherscan.
2. Generate the private proof [REAL proof] - the guest proves "escrow holds >= threshold" with the amount hidden; show it is a real proof artifact, amount never displayed.
3. Verify on Stellar + loan issues [REAL Soroban testnet tx] - Soroban verifies the proof and the vault disburses real Circle testnet USDC; tag "Groth16 verified on Soroban, amount hidden."
4. The cheat that fails [REAL] - submit a forged/over-stated proof; Soroban rejects, no USDC moves (red). Credibility shot.
5. Repay or default [REAL repay; REAL timeout via short demo timer] - repay reveals S, unlocks the Sepolia collateral; or the timeout path lets the lender claim.
Only the state-root poster is trusted-not-mocked, and the README says so. Headline: real cross-chain credit where the proof gates real money and the borrower's Ethereum position stays private.

## 11. In / out of scope
IN: Sepolia escrow with 3 exits; RISC Zero privacy guest; Soroban verifier + minimal USDC lending vault; Reflector loan sizing; checkpoint relayer; secret-reveal repay + timeout liquidation; the cheat-fails path; honest README.
STRETCH [GATE]: __check_auth-as-authorization; price-default liquidation wired live; passkey wallet.
OUT / FUTURE-WORK: ZK light client to remove the checkpoint trust; hiding the escrow<->loan hashlock correlation (full unlinkability); mainnet; multi-asset; production hardening; audits.

## 12. False-promise guardrails (never claim)
Not "trustless" (checkpoint + oracle + timeout). Not "we removed the bridge" (we removed the relayer's authority over WHAT happened, given a trusted root). Not "audited/production." Not "the amount is provably correct to the lender beyond the threshold" (only >= threshold is proven). Not "fully unlinkable" (the hashlock correlates the two sides; main-wallet + amount are hidden, full unlinkability is future work). Not "instant" (proving takes minutes). Not "integrated with Blend" (purpose-built vault, because no Stellar lender supports external collateral).

## 13. Build plan (I build; RISC-Zero-first; spike-gated)
- PHASE 0 [GATE]: the spike - a RISC Zero proof of one Ethereum storage slot, Groth16-BN254, verified inside a Soroban testnet contract via Nethermind's verifier. Go/no-go. Likely user-input point: the Groth16-wrap proving needs ~16-32GB local Docker RAM or a prover-network key.
- PHASE 1: Sepolia escrow contract (lock + hashlock + 3 exits), deployed.
- PHASE 2: RISC Zero privacy guest (amount/address private; commit threshold + nullifier + H + roots); wrap to Groth16.
- PHASE 3: Soroban vault (verifier + borrow/repay/liquidate; Circle USDC; Reflector sizing; nullifier set with TTL extension).
- PHASE 4: checkpoint relayer + secret-reveal relay + thin client UI.
- PHASE 5: end-to-end run, the cheat-fails path, honest README, record the 2-3 min demo.
Build-time note: I work fast and in parallel, so the constraint is not human-hours; it is Phase 0 composing and the debug cycles on the Groth16 public-input encoding. Phase 0 gates everything: if it lands, the rest is mechanical for me; if it walls, we fall back to confidential payments having spent only the spike.

## 14. Rules / judging alignment [VERIFIED]
Bar: load-bearing ZK + genuine Stellar integration (proof verified in a Soroban contract; testnet sufficient) + honest working demo; execution > scope; honesty > polish; 2-3 min screen demo; open-source repo; deadline 2026-06-29 19:00 UTC; no weighted rubric; no sponsor bounties. This scope: the proof is on the critical path (gates real USDC, amount hidden), verifies on Soroban, one sharp flow, README discloses every trust assumption. Belongs in Real-World ZK (ZK Gaming is a separate, closed hackathon).
