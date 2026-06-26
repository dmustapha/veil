# Warroom V3 — Corrections & Concerns Snapshot (cumulative from V1 + V2)
Date: 2026-06-24

## NEW V3 correction (the big one)
- C-V3-1 [C-weighted] STELLAR-CORE DOMAIN MANDATE. The use case AND the demo must sit in Stellar's actual heartland: cross-border payments/remittance, stablecoins/USDC, RWA tokenization (BENJI/tokenized treasuries), aid disbursement (Stellar Aid Assist / SDP), anchors (SEP-24/31). Generic domains where Stellar has NO special relevance (insurance, gaming, generic identity) are PENALIZED/killed. Insurance angle explicitly rejected by Dami.
- C-V3-2 [CONSTRAINT] STELLAR-NATIVE HOOK required: each idea must use a REAL Stellar primitive: Reflector oracle (signed FX/price feeds), Stellar Disbursement Platform / Aid Assist, anchors (SEP), USDC, BENJI RWA, Soroban native BN254/Poseidon/BLS12-381.
- C-V3-3 [CONSTRAINT] FINALIZE A DEMO: each idea ships a concrete 3-min Stellar-core demo with a visible cheat->red moment.

## Retained considered directions (force-saved, NOT mandatory center)
- ProvenCompute engine: "prove a computation/fact correctly + keep inputs private + move real money on Stellar." Grounded example: FairWire (provably-fair remittance FX pricing via Reflector). MAY win but pool must stay diverse.
- ProofBridge engine: verify a foreign/standard proof on Stellar. NOTE research caveat: many real proofs are chain_id-bound -> verbatim reuse only works for chain-agnostic statements (feasibility risk).

## Carry-forward kills/penalties (cumulative)
- prior_warroom_repeat (EXCLUDE unless transformed): Solvent (PoR), PayVeil (payroll), PassportRWA (zkKYC), CleanGate (sanctions), ClaimChain (aid dedup), MirrorProof, ProofOfAbsence, NetSettle, ClaimCheck-insurance.
- Organizer-named clone penalty (high clone-risk): plain proof-of-reserves, zkKYC-gated RWA, sanctions screening, plain private payments, confidential tokens, private payroll.
- Self-duplication kill-list: GhostPay (private payment + selective disclosure); GhostFund (confidential DeFi vault); AlphaAttest (commit-resolve-attest reputation); Agent Auditor (agent trust scoring); SolvencySwap (depeg breaker); AgentMesh (agent payment mesh).
- No bolted-on AI/agents (this is a ZK hackathon, not the agents one). C-NA1.

## V1/V2 invariants (all hold)
ZK load-bearing (remove proof -> product breaks); deep Stellar-native integration (U6); uniqueness up-weighted; novel-but-grounded + 6-day buildable (fork soroban-examples groth16_verifier / rs-soroban-ultrahonk / stellar-risc0-verifier); real humans + day-1 users; "Mild wins when sharp."

## Stellar facts for grounding (from research)
- Reflector: Stellar-native 7-node multisig oracle, signed FX/price/external feeds into Soroban.
- Stellar Aid Assist / SDP: SDF flagship; UNHCR delivered $1.1M USDC to 1,500+ unbanked refugees.
- BENJI (Franklin Templeton): $650M tokenized US treasury fund on Stellar; RWA on Stellar > strong.
- $10.8M Blend oracle-manipulation exploit -> "provably-correct-from-signed-oracle" is a live pain.
- Anchors + USDC = Stellar's real money rails.
