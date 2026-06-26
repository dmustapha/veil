## Chain DNA: Stellar (Soroban + new ZK host functions)

**Unique capabilities:**
- Real-world money rails: native stablecoins (USDC), anchors / fiat on-off ramps, cross-border settlement. Stellar moves real money at scale today.
- Fast, cheap finality (~5s, sub-cent fees) -> ZK verify cost actually matters and is now affordable.
- Soroban: Rust/WASM smart contracts.
- NEW native ZK host functions: BN254 + Poseidon/Poseidon2 (P25 "X-Ray"), 9 more BN254 fns (P26 "Yardstick"), BLS12-381 (earlier). On-chain SNARK verification is cheap.
- BN254 mirrors Ethereum precompiles -> proofs from other ecosystems verify on Stellar (cross-chain proof compatibility).

**Founding thesis:** Move money across the world cheaply; financial inclusion; bridge crypto to real-world finance and compliance.

**Community builds:** payments, stablecoins, remittance, RWA tokenization, anchors, institutional settlement; now privacy/ZK (Privacy Pools, Confidential Tokens, zkKYC).

**Path of least resistance:** fork a verifier contract (stellar/soroban-examples groth16_verifier, or UltraHonk/RISC0 verifiers), generate proof off-chain (Circom/Noir/RISC Zero), verify on-chain with native host functions. Reference: NethermindEth/stellar-private-payments.

**Honest constraints:** primitives are building blocks, not end-to-end products; UltraHonk (Noir) proofs larger/costlier (much improved P26); smaller ZK dev community than Ethereum; Soroban ZK tooling young; only ~6 days.

**Top community frustrations:** every balance and payment is public on a transparent ledger (privacy gap); compliance-vs-privacy tension for institutions; how to bring ZK to REAL money (not toy demos).

**Builder-history forbidden shapes (concern #15, do NOT regenerate):** private-payment-with-selective-disclosure (GhostPay, shipped); private/confidential-DeFi-vault (GhostFund, shipped); commit-resolve-attest on-chain reputation/track-record (AlphaAttest, in-flight); agent-trust-scoring/sybil-attestation (Agent Auditor, shipped); automated-solvency/depeg-circuit-breaker (SolvencySwap); agent-discovery/agent-payment-mesh (AgentMesh).
