# WINNER BRIEF — Veil

> **This file was stale (said zkTrack/SilentGauge). Superseded 2026-06-26.**
> The authoritative charter is **`/Users/MAC/stellar-hacks-zk/SCOPE.md`**.
> Build-ready spec: **`/Users/MAC/stellar-hacks-zk/ARCHITECTURE.md`**.

**Veil** — Borrow USDC on Stellar against collateral you keep on Ethereum, proving you are
good for it with a zero-knowledge proof that **hides the exact amount and your Ethereum
identity**. The collateral never bridges; the proof, not a relayer, is what Stellar trusts.

- **Load-bearing ZK:** the amount + Ethereum address are private witnesses. Delete the ZK and
  you must publicly reveal your holdings and wallet to borrow — the product is gone. Soroban can
  verify an Ethereum Merkle proof directly, so only the *privacy* (a SNARK) is irreducible.
- **zkVM:** RISC Zero (Nethermind's `stellar-risc0-verifier` verifies BN254 Groth16 on Soroban).
- **Lender:** our own minimal Soroban vault holding real Circle testnet USDC (Blend cannot take
  external collateral).
- **Liquidation:** all enforcement on Ethereum (repay-reveal-S, price-default, timeout-to-lender);
  no Stellar→Ethereum return proof.
- **Never claim:** trustless (state-root checkpoint + oracle + timeout are disclosed), audited,
  fully unlinkable, instant.

**Status:** Phase 0a go/no-go spike = **GO** (RISC Zero Groth16 verified on Soroban testnet;
see `spike/PHASE-0A-RESULT.md`). Building phases 1–5.
