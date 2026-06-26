# WAR ROOM V5 — Stellar Hacks: Real-World ZK — DELIBERATION BRIEF
Date: 2026-06-25 | Objective: pick THE ONE idea that is most winnable AND solves a real present-day Stellar problem, where hiding is load-bearing for the prover and the demo is anchored in real Stellar activity.

## THE ONE HARD GATE — Load-Bearing Privacy
Hiding must HELP the prover: the prover is FORCED to prove a fact and is HARMED by disclosure. REJECT if (a) the prover would happily reveal anyway, or (b) a trusted party already sees the data and could just sign an approval (then the ZK is decorative). FairLoan died here: a borrower wants the loan and the anchor already sees income.

## HARD KILLS (auto-reject, generators self-filter)
1. Front-running / MEV / transaction-ordering / dark order book / sealed-bid-because-of-sniping. DEAD on Stellar: no public mempool, intra-ledger apply order is randomized fee-independently (verified vs stellar-core + SDF docs). The premise is Ethereum-shaped and false here.
2. Charity / aid / remittance / insurance. Outside-the-ecosystem per builder. Native integrative DeFi/ecosystem only.
3. Bolted-on AI / agents. This is a ZK hackathon.
4. Duplicating Nethermind's already-built private-payment privacy pool (shipped PoC: anonymous payments + ASP set-membership).

## MUST-HAVES (every surviving idea)
- ZK load-bearing (remove the proof, the product breaks).
- Native + integrative to PRESENT-DAY Stellar activity, not ahead-of-market.
- Buildable in ~4 days: fork a verifier (Circom/Groth16 cheapest, Noir easiest) + ONE circuit. NO in-circuit signature verification, matching engines, or recursion.
- Touches Stellar for real (Soroban verifier on testnet/mainnet, native BN254/Poseidon/BLS12-381).

## PERMISSIONS (reversals of V1-V3 assumptions — these now HOLD)
- Uniqueness = differentiated vs OTHER hackathon/market projects, NOT vs the builder's own repos. Self-duplication is NO LONGER a kill.
- Intertwining builder repos is WELCOME as reusable plumbing/mechanism: GhostPay (view-key selective disclosure), GhostFund (confidential vault), AlphaAttest (commit-resolve-attest), CRE Compliance Gate (compliance gating), SolvencySwap (depeg/oracle).
- Institutional confidential-but-auditable plays are now ALLOWED.
- One lighter guard remains: do not ship a straight clone of the in-flight AlphaAttest product to this hackathon; reuse its mechanism inside a different product, fine.

## CROWDING (WILD scorer: MODERATE penalty)
Stellar's named "first wave" = confidential tokens, institutional private settlement, zkKYC. These are the most crowded with other submissions. Penalize a BARE first-wave idea, but FORGIVE it if it adds a genuinely uncrowded twist (auditor view-key, a composition no other team will ship, a novel binding to a native primitive).

## ANCHOR SURFACES (where real Stellar money/activity is, present-day)
- Payments / stablecoins (USDC) — highest velocity.
- RWA ~$2B on-chain, BENJI (Franklin Templeton tokenized treasury) the flagship.
- Soroban DeFi: Blend lending ~$124M, Aquarius AMM ~$46M.
- Governance: Aquarius gauge voting — the one real active on-chain Stellar DAO; documented vote-buying/bribe economy.
- Native primitives: Reflector signed oracle (FX/price), anchors (SEP-24/31), Soroban cross-contract balance reads, Stellar Asset Contract.
- Carry Aquarius private-but-auditable gauge voting forward as ONE candidate, NOT the default.

## JUDGING CRITERIA
ZK Load-Bearing 35 | Stellar Integration Depth 25 | Real-World Utility 20 | Execution & Demo 20. Plus YC Problem Quality (0-6) floor (<3 = killed). "Mild projects win when sharp." Real-money fit is a tie-breaker, not a gate.

## HACKATHON FACTS
SDF/DoraHacks; $10K XLM top-5 (1st $5k); single open track; deadline 2026-06-29 ~19:00 UTC (~4 days). Submission: open-source repo + 2-3 min video + ZK load-bearing + touches Stellar. Judges: SDF engineers (names unpublished). No public weighted rubric. ~132 registered at intel.

## ZK PATHS (forge finalizes)
Circom/Groth16 (cheapest verify, official soroban-examples groth16_verifier). Noir/UltraHonk (easiest, P26 made it cheap). RISC Zero/zkVM (heavy off-chain compute). BN254 mirrors Ethereum precompiles (foreign proofs can verify on Stellar).

## AGENT ROLES (Round-0 lenses)
PURIST (ZK load-bearing irreducibility) | ROOTS (Stellar-native depth + real ecosystem use) | MARKET (real-world utility + judge-love) | WILD (uniqueness-vs-competitors + 4-5 day feasibility, MODERATE first-wave penalty with twist-forgiveness).

## CUMULATIVE prior_warroom_repeat EXCLUSIONS (do not resurface unless transformed)
Solvent (PoR), PayVeil (payroll), PassportRWA (zkKYC), CleanGate (sanctions), ClaimChain, MirrorProof, ProofOfAbsence, NetSettle, ClaimCheck-insurance, EqualShare, RailProof, Coupon Splitter, ProofOfReach, FairPath, Cohort. Organizer-named clones penalized (allowed only with an uncrowded twist): plain proof-of-reserves, zkKYC-gated RWA, sanctions screening, plain private payments, confidential tokens, private payroll.
