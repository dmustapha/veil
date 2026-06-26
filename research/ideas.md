# Stellar Hacks: Real-World ZK — Ideas (V5)
## Selected: SilentGauge (winner) | Backup: LedgerProof

## V5 Pool Stats
- Raw generated: ~44 (G1:7 G2:6 G3:7 G4:7 G5:8, minus dupes across 7 convergence clusters)
- Clusters: proof-of-reserves (5, DOMINANT, KILLED = V1 Solvent reincarnated), private-collateral-health (6), private-gauge-voting (4), confidential-RWA-distribution (3), auditor-view-key (4), membership/eligibility (6, crowded), singletons (ProofBridge, fair-price-band, income-threshold)
- Killed: PoR cluster (prior_warroom_repeat + organizer-clone); DONOR-PRIVATE (charity hard-kill); CLEAN-FUNDS (sanctions organizer-clone); THRESHOLD-PAY (weak load-bearing, renter would reveal); all V1/V2/V3 repeats
- Anti-attractor + provenance: PoR dominant cluster matched the V1 winner -> whole cluster killed, not thinned-to-1
- Self-dup: NOT a kill this round (user reversed) -> GhostFund/GhostPay/AlphaAttest plumbing allowed as intertwine
- Presented: 6 (spike-selected: top-by-total + top-2-Novel + top-1-Memorable)

## Presented Pool (V5)

### SilentGauge — private-but-auditable Aquarius gauge voting that kills the on-chain bribe market [governance · the carried candidate]
Hide each voter's gauge choice AND weight; prove the ballot is backed by valid non-double-spent veAQUA (Merkle membership + nullifier) and that the published per-gauge tally is the correct sum. Public votes are the PRECONDITION that makes Aquarius's documented bribe market work (a briber must see the vote to pay for it); hiding the vote collapses the bribe market while keeping the tally provably honest.
**Why this chain (U6):** Aquarius is the one real active on-chain DAO on Stellar (~$46M AMM); veAQUA locking + gauge contract are Soroban-native; tally verified with native Poseidon/BN254. Port = rebuild Aquarius.
**Load-bearing:** Voter forced to prove eligibility+weight to be counted; harmed by disclosure (bribe coercion/retaliation). A trusted tallier seeing plaintext is itself the bribe target. Pure visibility-privacy, NOT ordering (no front-running).
**Buildability:** HARDEST. Membership + nullifier + tally aggregation. Scope to fixed voter cohort + sum-of-commitments revealed at close. Fork Groth16/BN254.
**Origin:** convergence G1×G2×G3×G4

### GhostMargin — private under-collateralized credit line proven against the live oracle [DeFi · confidential credit]
A borrower proves collateral covers debt at the required ratio at the live Reflector price WITHOUT revealing position size or asset mix, unlocking an OTC / under-collateralized credit line. Collateral held in a confidential vault (GhostFund plumbing) so it is NOT already public on Blend. Price drops -> proof against the new signed price fails -> credit blocked, size never shown.
**Why this chain (U6):** Reflector signed oracle feeds the price as a public input the contract verifies in the same call; Blend (~$124M) is the native lending venue. Port = rebuild oracle binding + lending state.
**Load-bearing:** Large borrower forced to prove health to an adversarial counterparty; harmed by disclosure (position size = a liquidation-hunting map + strategy leak). Price moves, so no static signature works.
**Buildability:** Single ratio inequality (collateral*price >= ratio*debt), oracle price public input. Very buildable. Fork Groth16/BN254.
**Origin:** convergence G1×G2×G4×G5

### LedgerProof — provable correct RWA distribution over a hidden holder ledger [RWA · BENJI]
A tokenized-treasury issuer (BENJI-class) proves every holder was paid correctly pro-rata AND the payouts sum to the public declared total, over a HIDDEN holder ledger. Skim/underpay breaks the sum or a per-leaf equality -> proof fails.
**Why this chain (U6):** BENJI / RWA (~$2B) issues on Stellar; the declared total and stablecoin payout rail are Soroban-native; Merkle-sum verified with native Poseidon. Port = rebuild Stellar payment/asset semantics.
**Load-bearing:** Issuer forced to prove correct+complete distribution to regulators/holders; harmed by publishing the holder list (the customer book). A self-signed "we paid everyone" PDF is the discredited status quo.
**Buildability:** Fixed-size Merkle-sum + per-leaf multiply-equality (e.g. 64 leaves). Fork Groth16/BN254. Moderate.
**Origin:** convergence G1×G3

### ClearView — auditor view-key proof-of-property over a confidential balance [compliance · crowded-with-twist]
An institution holding a confidential-token balance proves a PROPERTY (balance >= reserve floor, or < a cap) to its regulator via an auditor view-key, while the public sees nothing. The uncrowded reporting layer ON TOP of the crowded confidential-token first wave: not more hiding, but selective provable disclosure. Intertwines GhostPay view-key + CRE Compliance Gate.
**Why this chain (U6):** Built on Stellar's actual confidential-token commitment format + native verify; answers SDF's named compliance-vs-privacy pain directly. Port = rebuild the standard.
**Load-bearing:** A confidential-token-holding institution is forced by its regulator to prove a reserve/exposure property; public disclosure defeats the confidential token it adopted; a signed PDF fails the regulator who wants cryptographic non-repudiation over real chain state.
**Buildability:** One range circuit over the confidential-balance commitment + view-key tag. RISK: depends on the confidential-token commitment format being stable enough to fork in 4 days. Fork OZ confidential-contracts reference.
**Origin:** convergence G1×G3×G4

### GateRWA — anonymous accredited-investor membership gating peer-to-peer RWA settlement [RWA · sharp mild]
A buyer proves Merkle membership in the issuer's accredited-investor allowlist (+ nullifier, one proof per settlement) to receive a regulated RWA token, WITHOUT revealing identity or which leaf. Gates a real Soroban RWA transfer. The uncrowded twist over plain zkKYC: peer-to-peer settlement gating, not a standalone identity badge.
**Why this chain (U6):** Allowlist root + transfer hook live in the issuer's Soroban contract; native Poseidon Merkle verify. Port = rebuild the token transfer hook.
**Load-bearing:** Buyer forced to prove accreditation to settle; harmed by linking legal identity to a regulated-securities position on a permanent public ledger. Issuer-signs-each-transfer recreates a surveillance choke point.
**Buildability:** Merkle membership + nullifier, canonical circuit, VERY buildable. Fork Poseidon/BN254. Reuses AlphaAttest mechanics.
**Origin:** convergence G4×G5×G1×G3

### ProofBridge — verify an unmodified Ethereum BN254 proof verbatim on Stellar [cross-chain · WILD novelty spike]
A chain-agnostic Groth16/BN254 proof (membership/threshold credential) generated once for an EVM verifier is verified BYTE-FOR-BYTE on Soroban using the identical verifying key, no regeneration. Demo: same proof bytes, two chains, both green; tamper one byte -> Stellar red.
**Why this chain (U6):** Stellar's P25 BN254 host functions mirror Ethereum's precompiles, so the proof verifies unchanged. This cross-ecosystem portability is the capability. Caveat: only chain-agnostic statements (no chain_id binding).
**Load-bearing:** A user with an EVM-issued private credential is forced to prove eligibility to a Stellar venue WITHOUT re-doxxing to a new issuer; disclosure links their EVM and Stellar identities (the exact privacy the credential bought).
**Buildability:** Lowest circuit risk (reuse an existing Semaphore-style circuit). The novelty is the dual-verify harness. Weak real-money story (the V1 ProofBridge dissent).
**Origin:** G2 singleton

## Killed Ideas (sample)
| Idea | Origin | Cause |
|---|---|---|
| ProofOfReserves / Atomic Reserve / PROOFOFRESERVE-ANCHOR / RESERVE-LINE / ANCHOR-SAFE | G1/G2/G3/G4/G5 | prior_warroom_repeat (= V1 Solvent) + organizer-clone; dominant-cluster provenance kill |
| DONOR-PRIVATE | G5 | charity/treasury hard-kill |
| CLEAN-FUNDS (sanctions non-membership) | G5 | sanctions = organizer-named clone, crowded |
| THRESHOLD-PAY (income to landlord) | G5 | weak load-bearing (renter would happily reveal) |
| Verbatim/Cross-State variants, NAVATTEST, PRICE-HONEST, SilentLP, WHALE-PROOF, EligibleAnchor, ELIGIBLE, RECEIVABLE-VERIFY, SETTLEMENT-NET, VIEWKEY-PAYROLL | various | deduped into the 6 cluster representatives |
