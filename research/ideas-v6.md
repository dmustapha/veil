# Stellar Hacks: Real-World ZK — Ideas V6 (NOVELTY round)
## Axis: ZK as CORRECTNESS / trust-removal, NOT hiding. Privacy catalog banned as anti-examples.
## Selected: [AWAITING USER REACTION]

## Why V6
V1-V5 all converged on the ZK-as-privacy catalog (proof-of-reserves, confidential balances, zkKYC, private voting, private distribution). User rejected the entire pool as "all seen before." Root cause: generators read "ZK on Stellar" as "hide a financial value." V6 mines ZK's OTHER power: proving a computation or foreign fact is CORRECT so a cheap chain trusts it without a trusted middleman. Load-bearing test flips: remove the proof and the product needs back a trusted relayer/oracle/calculator/sequencer it exists to delete.

## Generation
5 generators across 3 axes. G1 (cross-chain) MISFIRED (returned a stale tool message); axis covered by G4+G5 MIRRORGATE. G2 zkVM (7), G3 flow-compression (8), G4 judge-non-privacy (7), G5 clean-room (7). ~29 ideas, 8 clusters.

## Presented Pool (V6) — 6 spike-selected

### PROOFLINE — keeper/executor accountability: prove a liquidation bot was ALLOWED to liquidate you [Blend · all-round strongest]
A liquidation keeper proves, via a RISC Zero guest that re-runs Blend's exact health-factor math against the attested Reflector price, that your position was genuinely eligible and that it seized the correct amount. Remove the proof and you trust the keeper not to liquidate you early or skim. Reclaims the liquidation theme with NO front-running (load-bearing leg is correctness-of-execution, not ordering). Demo: keeper tries to liquidate a healthy position -> proof fails -> blocked (red). Fork stellar-risc0-verifier + a guest mirroring the health-factor formula. Novelty: nobody demos "prove you were allowed to liquidate me."
TRUST-REMOVED: the liquidation keeper/relayer. Origin: G4.

### RIFT — anchor rate-integrity: prove the quoted FX/exchange rate is the honest average of the signed feed [anchors/SEP · most native, legible]
A Stellar anchor proves its quoted on/off-ramp rate equals the volume-weighted average of Reflector-signed price ticks, so it cannot silently pad its spread. NOT remittance: the load-bearing leg is rate-computation integrity (removing the anchor as a trusted rate-calculator), applicable to any anchor FX. Demo: anchor shaves 1.5% off the true VWAP -> proof fails -> withdrawal rejected (red). Fork groth16_verifier + a VWAP-over-committed-feed circuit (commit ticks to a Poseidon root, prove over the root, no in-circuit sigs). Novelty: everyone proves a PRIVATE price; nobody proves the PUBLIC rate is honestly derived.
TRUST-REMOVED: the anchor as trusted rate calculator. Origin: G4 (RIFT) + G2 (TWAPSETTLE).

### ANCHORNET — verifiable anchor settlement: prove a day of off-chain SEP events nets to the correct on-chain USDC settlement [anchors · most real fiat money]
A Stellar anchor proves a fixed batch of its signed off-chain fiat events (SEP-6/24 deposits and withdrawals) correctly nets to the single on-chain USDC reserve settlement it posts, and that its reserve never went negative. Removes trust in the anchor's reported net. Demo: anchor under-reports a withdrawal to inflate its net -> proof fails -> settlement blocked (red). Fork groth16_verifier + a commit-then-sum circuit (Merkle root of pre-validated events + signed-delta sum + non-negativity; sigs checked off-circuit). Novelty: proves the FLOW (a day of events), not a static reserve snapshot.
TRUST-REMOVED: the anchor's books. Origin: G3.

### FEESPLIT — verifiable revenue waterfall: prove a complex multi-tier payout split ran correctly [payouts · cleanest build]
A revenue pool with a real multi-tier waterfall (senior tranche, fees, hurdles, caps, then pro-rata to many junior holders) proves every recipient's cut was computed correctly and the total conserves (no skim), then disburses USDC. Load-bearing because the waterfall is too complex/expensive to run on-chain (a simple pro-rata split would NOT need ZK; the multi-tier version does). Demo: operator alters a hurdle to skim a tranche -> conservation/param check fails -> disbursement blocked (red). Fork groth16_verifier + a waterfall arithmetic + conservation circuit. Cleanest, lowest-risk build. Novelty: revenue waterfalls are where real money is quietly stolen via opaque math.
TRUST-REMOVED: the fund admin / payment processor. Origin: G2 (+ G3 SPLITPROOF, G2 ACCRUEPROOF adjacent).

### MIRRORGATE — cross-chain proof bridge: verify an Ethereum event proof verbatim on Soroban, release USDC, no relayer [cross-chain · novelty CEILING, high risk]
Because Stellar's BN254 host functions mirror Ethereum's precompiles, a Groth16 inclusion proof of an Ethereum event verifies byte-identical inside a Soroban contract, which then releases USDC, with no trusted bridge relayer (bridges lost $2B+ to trusted relayers). Demo: prove a real ETH deposit -> Soroban releases USDC (green); forge a deposit that never happened -> rejected (red). HONEST RISK: a fully-trustless light-client header sync is NOT 4-day buildable; the 4-day version pins a checkpointed header (reintroducing some trust) or demos the verbatim-verify identity. Maximally Stellar-unique, highest novelty, hardest + load-bearing-wounded in the buildable version.
TRUST-REMOVED: the bridge relayer/multisig. Origin: G4 + G5 (MIRRORGATE x2).

### ATTESTRUN — ZK as a trustless referee: pay a bounty only when a proof shows a program produced the required output [compute markets · safe-novel]
A USDC bounty escrow on Soroban releases to whoever submits a RISC Zero proof that a specified program, on a given input, produced an output meeting the success predicate (a solver win, a benchmark beaten). The proof IS the judgment, removing the human referee. Demo: submit a real winning solution -> receipt verifies -> paid (green); claim a solution that does not clear the threshold -> receipt predicate fails -> no payout (red). Lowest circuit risk (RISC Zero = write the guest in plain Rust, no custom circuit). Novelty high. WEAKNESS: chain-agnostic, so Stellar-integration depth is shallow (only the USDC escrow + receipt verify live here).
TRUST-REMOVED: the bounty judge/referee. Origin: G5.

## Honest cross-cut
- Strongest all-rounders: PROOFLINE, RIFT, ANCHORNET (load-bearing + Stellar-native + real-money + novel + buildable).
- Cleanest build: FEESPLIT (pure arithmetic + conservation).
- Novelty poles: MIRRORGATE (highest ceiling, highest risk, load-bearing wound in 4-day version), ATTESTRUN (safe-novel via zkVM, weak Stellar depth).
- Banned-catalog boundary held: every idea proves CORRECTNESS and removes a trusted middleman; nothing hides a balance.
