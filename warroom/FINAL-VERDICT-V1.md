# WARROOM DELIBERATION TRANSCRIPT — Stellar Hacks: Real-World ZK (V1)
Date: 2026-06-23 | Working dir: /Users/MAC/stellar-hacks-zk

## Phase 0 — Setup
- TASTE blocks selected: Universal Laws + C-NA1 (not AI-centered) + C-DF1 (payments/value flows).
- Config synthesized from first-party brief. Judging criteria (no public rubric): ZK-LoadBearing 35, Stellar-Integration 25, Real-World-Utility 20, Execution&Demo 20.
- Builder history loaded. Shipped forbidden-shapes: GhostPay (private payment + selective disclosure), GhostFund (confidential DeFi vault), AlphaAttest (commit-resolve-attest reputation), Agent Auditor (agent trust scoring), SolvencySwap (automated depeg breaker), AgentMesh (agent payment mesh). In-flight: none collide (no Stellar/ZK active project).
- Social creds absent -> community/social signals skipped (not a blocker).

## Phase 0B — Agent Roles (auto-approved, autonomous)
- ZK-PURIST (lens: is ZK irreducibly load-bearing? attacks decorative ZK) -> criterion ZK-LoadBearing.
- ROOTS (lens: Stellar-native depth, U6) -> criterion Stellar-Integration.
- MARKET (lens: real users, real money, day-1 demand) -> criterion Real-World-Utility.
- WILD (contrarian X-factor: novelty/memorability + 6-day feasibility realism) -> 4th role.

## Stage 1 — Parallel Generation (5 fresh-context generators)
G1 Pain: 8 ideas | G2 Capability: 8 | G3 Inversion: 8 | G4 Judge: 7 | G5 Clean-room: 8. Total raw: 39.

## Stage 2 — Synthesis
Deduped to ~12 distinct shapes:
A. Proof-of-Reserves/Liabilities (solvency) — DOMINANT cluster (G1#2, G3 ProofOfReserve.x, G4#1/#6, G5 PoR-Stablecoin)
B. zkKYC credential-gated RWA transfer (G1#3, G4#3, G5 Age/Residency RWA)
C. Sanctions non-membership screening (G2 SanctionGate, G4#7, G5 Sanctions-Screened)
D. Private payroll w/ provable sum (G1#6, G2 TallyVault, G4#2)
E. Cross-ecosystem proof verify (BN254=ETH mirror) (G2 ProofBridge/CrossProofEscrow/HonkPort)
F. Sealed-bid settlement (G1#5, G3 SealedBid, G4#5)
G. Verifiable off-chain compute / RISC Zero pay-on-receipt (G1#7, G3 Oracle-Proven, G4#4)
H. Private allowlist/airdrop + nullifier (G3 Allowlist Zero, G5 Private Airdrop)
I. Confidential balances / shielded RWA cap-table (G1#1, G1#8) — flagged near GhostFund
J/K/L/M. Provable draw / private lending / dark-pool match / private FX — lower priority

## Pool Gates
- Gate1 history: no inflight_duplicate. Cluster D (payroll) and any "private transfer" flagged for GhostPay proximity; cluster I flagged for GhostFund proximity. PoR confirmed distinct from SolvencySwap (attestation vs automated trade).
- Gate1 [C] checks: all surviving clusters name real humans (custodians/depositors, RWA investors, compliance teams, employees) + day-1 users exist.
- Anti-attractor + provenance: dominant PoR cluster does NOT match a shipped/in-flight project -> ordinary <=1 quota, keep best PoR.
- Saturation note ([C3]): PoR, zkKYC, sanctions are organizer-named -> highest intra-hackathon clone risk; novelty wedge required.
- Spike selection -> presented pool of 6 (see ideas.md).

## Round 0 — Independent Scoring (4 lenses, stripped/randomized)
Merged criteria-weighted totals (per-criterion cross-agent avg x weights):
1. Solvent (PoR+Liabilities, on-chain reserve cross-check) — 8.80
2. PayVeil (private payroll, provable sum) — 8.00
3. PassportRWA (zkKYC-gated RWA) — 7.80 | ProofBridge (cross-ecosystem proof) — 7.80
5. CleanGate (sanctions non-membership) — 7.55 | ProvenCompute (RISC Zero) — 7.55
High-divergence: ProofBridge & ProvenCompute (WILD high on novelty, MARKET low on day-1 users).

## Demo Scripts — verdicts
Solvent: STRONG (verify-own-inclusion + tamper-fail is a single decisive on-screen moment).
PayVeil: STRONG (fund -> hidden batch payout -> employee-only view).
PassportRWA: strong (blocked -> prove -> unlock RWA buy).
ProofBridge: strong-if-it-works (paste foreign proof -> USDC releases) — feasibility risk.
CleanGate: thin-to-strong (clean settles / dirty blocked).
ProvenCompute: strong (request -> verify receipt -> pay) — proof-gen latency risk.

## Fact-Check (top 3 + ties) — hands-on
- soroban-examples groth16_verifier EXISTS (official) — VERIFIED.
- Native BN254 + Poseidon/Poseidon2 host fns on Soroban (P25/P26) — VERIFIED (brief + Soroban SDK migration docs).
- Soroban can read on-chain Stellar asset balances (Stellar Asset Contract) for the reserve cross-check — VERIFIED (plausible, SAC balance read).
- Native Poseidon Merkle tree for PayVeil/inclusion — VERIFIED.
- RISC Zero verifier on Soroban EXISTS (NethermindEth/stellar-risc0-verifier) — VERIFIED.
No HARD-FAIL.

## Cross-Exam — Top 2 (Solvent vs PayVeil)
- vs Solvent (FLESH WOUND): "PoR is the most obvious idea -> clone risk; real reserves are off-chain fiat." Defense holds: on-chain-Stellar-reserve cross-check + Merkle-sum-tree well-formedness (prevents fake-negative-balance) + per-user inclusion = a wedge most clones skip; scope reserves to Stellar-issued stablecoin/RWA where reserves ARE on-chain.
- vs PayVeil (HEAVY HIT): payroll's privacy-payment DNA sits closer to shipped GhostPay (concern #15 proximity); aggregate-sum-proof is distinct but the family is adjacent.
- Verdict: NO FLIP. Solvent's self-duplication distance is cleaner and its differentiator survives.

## Challenge / Premortem — Solvent (risk register)
1. [HIGH] Intra-hackathon saturation (PoR is named) -> mitigate with on-chain-reserve cross-check + sum-tree well-formedness + flawless tamper-fail demo.
2. [HIGH] Circuit complexity in 6 days (Merkle-sum-tree + range + reserve sig) -> fork groth16_verifier, Circom path, minimal fixed-size circuit.
3. [MED] "Reserves are fiat" narrative gap -> frame as Stellar-issued stablecoin/RWA with on-chain reserves.
4. [MED] Soroban reading external account balances -> verify exact SAC balance read API early.
5. [MED] Numbers must stay hidden on explorer while proof is valid -> commitments + proof hash only.
6. [LOW] Proof-gen latency in demo -> pre-generate / spinner + wait marker.
YC Problem Quality: 6/6 (critical, large population, no good trustless+private solution).

## Selection
Winner: SOLVENT. Runner-up: PayVeil. Novelty dissent: ProofBridge.
DISSENT (WILD): "ProofBridge is the only idea a judge has literally never seen — unmodified Ethereum BN254 proof verified on a non-EVM L1. Solvent is safer but more cloned. If the room rewards novelty over polish, ProofBridge wins." Recorded; Solvent still wins on balanced criteria + feasibility + clean self-duplication distance.
