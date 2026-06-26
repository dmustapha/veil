# Stellar Hacks: Real-World ZK — V7 ecosystem-native directions
## Reframe: problems that exist ONLY because of how the ecosystem works. "Would a bank have this?" = NO for all.
## Sourced from real ecosystem discourse (SCF funding, exploit post-mortems, SDF's own posts), not TradFi.
## Selected: zkTrack (survived the babel402 source-verification gauntlet; VRF demoted for deletable-ZK, fog-of-war vetoed as out-of-scope vs the separate ZK Gaming hackathon)

### A. ZK-VRF — provably-fair randomness for Soroban [RECOMMENDED]
**Native problem:** Soroban has no secure native randomness. Its built-in PRNG is documented as "not suitable for security-sensitive work," so every fair-draw mechanic (NFT mint order, lottery, raffle, random selection, loot, validator-of-round) is either predictable (snipers win) or operator-controlled (team self-allocates), and the commit-reveal workaround is griefable by a non-revealing party. A bank never has this because the bank IS the trusted RNG and nobody audits it.
**Evidence (real, present, funded):** SDK doc caveat on Env::prng; OWASP SC09 + Valkyri "Top 10 ways Soroban contracts get hacked" both flag insecure randomness; the ecosystem is PAYING to fix it (NebulaVRF won $34K in SCF #34; a Chainlink VRF relayer exists only because there is no native VRF).
**ZK unlock:** prove output = VRF(sk, seed) with the pubkey commitment registered, verified on Soroban, so the draw is provably unbiased, deterministic from the seed, and unknowable before reveal. The proof IS the unbiasability guarantee (load-bearing), not a privacy wrapper.
**Stellar-native + timed:** the exact host functions to make this cheap (Poseidon/BN254 in X-Ray Jan 2026, BLS12-381 extended in Yardstick May 2026) JUST shipped. A BLS-signature VRF is the light path (BLS verify is a native host function).
**Buildable in 4 days:** yes, scoped to one VRF flavor + one real consumer (a provably-fair NFT mint or staked draw). Demo: operator tries to bias the draw -> proof rejects -> red.
**Inventive:** infrastructure the ecosystem is literally funding, reframed from "trust the operator's RNG" to "verify the draw." Not privacy, not TradFi.

### B. Cryptographic fog-of-war game with real USDC stakes
**Native problem:** incomplete-information games (hidden positions, fog of war, hidden commitments) are IMPOSSIBLE on a transparent ledger without ZK, because every node sees all state, so "hidden" state is read straight off the ledger and players cheat. A bank never has this; it is a pure consequence of every node seeing all state.
**Evidence:** the canonical crypto-native ZK-game pattern (Dark Forest, Ingonyama zkHunt): each move submits a commitment + a ZK proof of a valid state diff. Ahead-of-market ON Stellar (no on-chain hidden-info game on Soroban yet).
**ZK unlock:** each move proves the hidden state transition is rule-valid against a public commitment without revealing the hidden state. One move-validity circuit (textbook ZK).
**Stellar-native:** Poseidon commitments + BN254 per-move verify; Soroban holds the commitment tree; native USDC for real-money stakes (wagered matches) = satisfies the money angle. Pairs with VRF (A) for random events.
**Buildable in 4 days:** yes, scoped to a minimal two-player hidden-position game with on-chain USDC stakes. Most demo-friendly idea in the set.
**Inventive:** unambiguously crypto-native and visually compelling; the real-money stake on Stellar differentiates from Ethereum prior art.

### C. Prove a vault's track record without revealing its strategy
**Native problem:** on a public ledger every profitable trade is visible, so bots copy-trade and front-run a good manager, and being a known-good wallet destroys the edge (reflexivity). The only way to attract deposits is to expose the exact trades that ARE the edge. A bank never has this; its trade blotter is private by default, an on-chain fund's is broadcast.
**Evidence:** SDF's own privacy post frames it ("giving away strategic business information any competitor could see"); Chainlink notes transparency "has kept many skilled operators from participating in DeFi vaults"; proven elsewhere (Mina Proof-of-Alpha, Obscura) but NOT on Stellar; real Soroban vaults exist (DeFindex).
**ZK unlock:** a RISC Zero guest ingests the private trade set, commits to the COMPLETE set (anti-cherry-picking), recomputes P&L / win-rate / Sharpe, and the journal publishes only the verified metrics. Depositors trust the number without seeing the strategy. ZK for verifiable reputation, not balance-hiding.
**Stellar-native:** Nethermind's RISC Zero verifier on Soroban (heavy off-chain compute is its sweet spot); Reflector supplies verifiable historical marks; the journal gates a Soroban allocator/leaderboard.
**Buildable in 4 days:** yes via RISC Zero (one Rust guest). HONEST caveat: binding the proof to AUTHENTIC on-chain trades is the hard part; a 4-day version proves over a committed/Reflector-anchored dataset and flags full trade-authenticity as future work.
**Inventive:** the strongest "ZK for correctness/reputation, not hiding" framing; attacks a reflexivity problem unique to transparent ledgers.

### D. ZK anti-Sybil airdrop / reward gating
**Native problem:** pseudonymous accounts cost ~$0.10, so one human farms an airdrop or liquidity-mining program with hundreds of wallets. A bank never has this; KYC makes one human one account by construction.
**Evidence:** Arbitrum 47.96% same-person clusters, LayerZero 803K sybils, Optimism $18.6M removed; ON STELLAR Aquarius Proposal 24 documents reward-engine farming (~$40M mcap loss, named exploiter wallets); SCF uses manual + Neural Quorum Governance as its anti-Sybil; Dropzey is a Soroban airdrop hub with the problem.
**ZK unlock:** prove genuine distinct on-chain history (account age + independent activity + not in a known cluster) + nullifier for one-claim-per-genuine-actor, without revealing which account. Standard Merkle-membership + nullifier circuit.
**Buildable in 4 days:** yes (known airdrop ZK pattern). CAVEAT: closest of the set to the excluded gating/zkKYC catalog; frame strictly as Sybil-cost economics, not identity disclosure. "Genuine human" is really "genuine distinct history" (raises Sybil cost, does not eliminate).
**Inventive:** hardest quantified evidence + a real on-Stellar consumer, but the least-fresh framing of the four.

## Not 4-day-buildable (surfaced, honestly parked)
- Wash-trading / genuine-volume proofs: trade-authenticity binding exceeds the window.
- Classic-layer (SDEX / claimable-balance) ZK inclusion proofs for Soroban: maximally Stellar-unique but the ledger-structure depth is too deep for 4 days.

## Bottom line
A (ZK-VRF) and B (fog-of-war) are the strongest blend of ecosystem-native + inventive + Stellar-unique + buildable. C is the most intellectually inventive DeFi framing. D has the hardest evidence but the least-fresh framing.
