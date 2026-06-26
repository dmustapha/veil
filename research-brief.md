# research-brief.md — Stellar Hacks: Real-World ZK

Intel phase output. Generated 2026-06-23. Authoritative brief lives at
`~/.claude/skills/hackathon-briefs/stellar-hacks-zk.md`.

## Snapshot
| Field | Value |
|---|---|
| Name | Stellar Hacks: Real-World ZK |
| Organizer | Stellar Development Foundation |
| Platform | DoraHacks |
| URL | https://dorahacks.io/hackathon/stellar-hacks-zk/detail |
| Format | Online / global |
| Prize pool | $10,000 in XLM (top 5) |
| Window | Jun 15 – Jun 29, 2026 |
| Deadline | Jun 29, 12:00 PM PST (~19:00 UTC, treat as hard cutoff) |
| Tracks | None (open-ended ZK-on-Stellar) |
| Registered | ~132 hackers at intel time |

## Prize breakdown
1st $5,000 · 2nd $2,000 · 3rd $1,250 · 4th $1,000 · 5th $750.

## What wins (the effective rubric)
1. ZK is load-bearing (removing the proof breaks the product).
2. Real-world money fit (payments, stablecoins, RWA, settlement, compliance) is "especially welcome."
3. Working on-chain implementation on Soroban + a clear short demo + open-source repo.
No public weighted percentages exist for this event; §5 of the brief is the bar.

## The stack
Off-chain proof: Noir / Circom / RISC Zero. On-chain: Soroban verifier contract using
Protocol 25 (BN254 + Poseidon) and Protocol 26 (9 more BN254 host functions) for cheap
on-chain verification (Noir proofs included).

## Candidate directions (for warroom)
- Private payment / confidential stablecoin transfer with on-chain Soroban verifier.
- zkKYC / selective-disclosure compliance gate for settlement.
- Privacy pool / shielded balance for a real asset.
- Verifiable off-chain computation settled on Stellar.
Bias: one deep, on-chain-verified, real-money flow over a broad app.

## Reference implementations / docs
- Stellar ZK docs: developers.stellar.org/docs/build/apps/zk
- NethermindEth/stellar-private-payments (private payments reference)
- noir-lang discussion #8654 (Interstellar: Noir + Soroban full ZK pipeline)
- Stellar blog: 5 real-world ZK use cases (zkTokens, zkLogin, zkKYC, zkVoting, zkVM)

## Community
Stellar Dev Discord #zk-chat · Stellar Hacks Telegram group.

## CONFIRMED via full first-party page text (2026-06-23)
- Single open innovation track, no sub-tracks, no mandatory framework.
- Video spec: **2 to 3 minutes**, show it working + what ZK does, need not appear on camera.
- Three proven ZK paths (pick one): **Circom/Groth16** (cheapest verify, official soroban-examples verifier), **Noir/UltraHonk** (easiest, P26 made it cheap), **RISC Zero/zkVM** (heavy off-chain compute). Each has a verifier repo + James Bachini E2E tutorial. See brief §7.
- Protocols: P25 "X-Ray" (BN254 + Poseidon/Poseidon2), P26 "Yardstick" (9 BN254 host fns), BLS12-381. CAP-0074/0075/0059.
- USE the Stellar Dev Skill in build: `/plugin install stellar-dev@stellar-dev` + skills.stellar.org/skills/zk-proofs.
- Key starter repos: NethermindEth/stellar-private-payments (privacy pool PoC), stellar/soroban-examples groth16_verifier, yugocabrio/rs-soroban-ultrahonk, NethermindEth/stellar-risc0-verifier.
- Official idea ladder (mild→wild) captured in brief §11 for warroom.
- Support: Discord discord.gg/stellardev #zk-chat · Telegram t.me/+e898qibDUVExODkx.

## Still no public weighted judging rubric
Effective bar = submission requirements + load-bearing ZK + Stellar integration + sharp execution. "Mild projects win when sharp." Real-world money is a tie-breaker, not a gate.
