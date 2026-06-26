# WARROOM V2 TRANSCRIPT — Stellar Hacks: Real-World ZK
Date: 2026-06-24 | Carries all V1 flags (see concerns-snapshot-V2.md)

## V2 setup
- Corrections: consider ProvenCompute + ProofBridge families (not center on them); up-weight UNIQUENESS; novel-but-grounded + 6-day-buildable; all V1 invariants.
- Generators: G1 ProvenCompute-family (grounded), G2 ProofBridge-family (grounded, reuse standard proofs to cut risk), G3 anti-obvious novelty, G4 native-primitive depth (novelty-weighted), G5 clean-room outsider.

## Stage 1 — 37 ideas generated.

## Synthesis + V2 kills
- prior_warroom_repeat KILLS (came back, excluded): all proof-of-reserves/solvency variants (PayrollSeal-adjacent excluded too), private payroll (PayrollSeal, PrivatePay), zkKYC passport (ProofKYC, KYC Passport), sanctions screening. These were V1 finalists or organizer-named clones -> down per C-V2-2.
- Self-duplication: none new.
- Retained-seed descendants kept: FairWire/ClaimCheck/NetSettle (ProvenCompute), MirrorProof (ProofBridge).
- Fresh standouts surfaced: ProofOfAbsence (prove a negative), ClaimChain (cross-org anti-double-dip relief).

## Presented Pool (V2) + Round-0 weighted scores
(criteria: ZK-LoadBearing 35 / Stellar-Integration 25 / Real-World-Utility 20 / Execution&Demo 20; uniqueness up-weighted)
1. ClaimChain — 8.20 — cross-org anti-double-dip aid via nullifier (no shared PII). Lowest build risk; financial-inclusion thesis.
2. ClaimCheck — 8.00 — parametric insurance: prove a payout triggered correctly from signed oracle data, policy private; auto-settle. [ProvenCompute family]
3. MirrorProof — 8.00 — verify the SAME Ethereum BN254 proof bytes on Soroban, release value. [ProofBridge family] Highest "only Stellar."
4. FairWire — 8.00 — prove a remittance FX rate was computed fairly from signed quotes without revealing the model. [ProvenCompute family]
5. NetSettle — 7.55 — multilateral netting: prove net vector sums to zero over a private IOU graph, settle nets. [ProvenCompute family]
6. ProofOfAbsence — 7.50 — prove you did NOT do something (zero exposure / no wrongdoing) over private data -> release bond/discount. Highest novelty, highest build subtlety.

## Demo-script verdicts: all STRONG except ProofOfAbsence (thin — "prove a negative" is hard to make legible on video) and NetSettle (clean but less emotional).

## Fact-check (hands-on): groth16_verifier + native BN254/Poseidon/BLS12-381 confirmed; nullifier/Merkle pattern canonical (ClaimChain lowest risk); BLS signed-data verify available for ClaimCheck; BN254 byte-identical proof verify plausible for MirrorProof (the genuine "only Stellar" flex). No hard fails. MirrorProof carries the most foreign-proof-generation plumbing risk (mitigated by reusing a standard circuit + fixture).

## Cross-exam (top contenders)
- ClaimChain: strong real-money + lowest risk, BUT the Merkle+nullifier cryptography is the most common ZK demo -> engineer judges may read it as "another nullifier airdrop." Novelty is in the use-case, not the math. (HEAVY HIT on technical novelty.)
- ClaimCheck: in-circuit signature verification of oracle data is genuinely interesting to engineers + emotional real-world demo + honors the ProvenCompute concept Dami likes. (Survives clean.)
- MirrorProof: highest technical novelty + "only non-EVM L1 that can," BUT weakest day-1 real-money story + most plumbing risk.

## Selection (recommendation)
Recommended winner: ClaimCheck (parametric ZK insurance). Reasoning: best blend of the ProvenCompute concept Dami likes + real-world-money emotional story (Stellar financial-inclusion thesis) + genuine technical novelty (in-circuit oracle-signature verification) + buildable in 5 days + fixes V1's clone problem.
Runner-up: ClaimChain (lowest risk, deepest inclusion story).
Novelty pivot: MirrorProof (ProofBridge family, highest "only Stellar" flex).
Wildcard: ProofOfAbsence (most original hook, highest build subtlety).
DECISION DEFERRED to user (Dami is hands-on on idea choice) -> present pool, lock at conductor CP2.
