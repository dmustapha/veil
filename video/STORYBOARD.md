# Veil — Storyboard

Strategy C (TransitionSeries + per-scene audio), GAP mode, 15fr crossfade, ~142s.
Brand: dark #0A0C10, light-grey #C7CCD1, single lime #BEF264 (proof/sealed-value only).
ETH domain = periwinkle #8E97C4; Stellar domain = light grey. Lime reserved for the ZK proof.

| # | Scene | Pattern | Visual |
|---|-------|---------|--------|
| 1 | Hook | Brand reveal (P) | Animated Veil monogram draws on, VEIL wordmark, 3-beat hook as editorial type. |
| 2 | Capital (Problem 01) | Two-column | Left: "Capital, stuck." Right: ETH plate (Ethereum) vs USDC plate (Stellar), a gap; "bridge or sell" = give up your position. |
| 3 | Privacy (Problem 02) | Two-column | Left: "Everything leaks." Right: public-ledger panel, collateral/loan/wallet rows flagged EXPOSED in red. |
| 4 | Solution | Full statement | "Veil gives you both." Two pillars (custody + privacy). Only {commitment, amount, proof} cross a boundary; big ETH stays put. |
| 5 | The Flow | Animated pipeline | 5 nodes: Lock WETH·Ethereum → Axelar (commitment+amount) → Browser Groth16 proof → Soroban verify BN254 → USDC disbursed. Domain boundary; "ETH stays here" anchor; packet travels; proof node is lime. |
| 6 | The Guarantee | Verifier gate | "No relayer. No committee." Valid proof → ACCEPT (lime) + USDC moves; tampered proof → REJECT (red) + no USDC. |
| 7 | Live Now | On-chain proof (L) | Real tx hashes typewriter-reveal (WETH lock, Axelar execute), ~6 USDC borrowed, both provers verify, tampered proof rejected, live app URL. |
| 8 | Close | Brand + CTA (H) | Corner brackets, monogram, VEIL, tagline, veilzk.vercel.app, track + repo, slow fade. |

Honesty: repay/release NOT shown as live. Only real proof cited. No em-dashes. No bridge-bashing.
