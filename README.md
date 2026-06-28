# Veil

**Borrow USDC on Stellar against collateral you keep on Ethereum — a zero-knowledge proof keeps your exact amount and Ethereum wallet off the Stellar ledger.** The collateral never bridges. The proof, not a relayer, is what Stellar trusts. (The hashlock is public on both chains, so Ethereum-side privacy is named future work — see [What is real vs trusted](#what-is-real-vs-trusted-we-never-say-trustless).) Built for Stellar Hacks: Real-World ZK.

> Live app: **https://veilzk.vercel.app** (testnet) · Track: Real-World ZK · Networks: Ethereum Sepolia + Stellar (Soroban) testnet

## Why the ZK is load-bearing (remove it and the product is gone)

Veil's borrow is gated by a RISC Zero proof whose **public outputs are only** `{ state_root, block, escrow, threshold, hashlock, nullifier }`. The exact collateral `amount` and the depositor `address` are **private witnesses that never leave the prover**. Delete the proof and `borrow()` on Stellar would have to carry your Ethereum amount and wallet in cleartext so the contract could check the Merkle proof itself, publishing both on the Stellar ledger permanently. Native Merkle verification cannot hide them; only the SNARK can. The proof is irreducible.

The proof is verified **on-chain inside a Soroban contract** (BN254 Groth16, Protocol 25/26 host functions), and only a valid proof moves real Circle USDC.

## The cheat that fails (proof gates the money)

This is the headline, proven live on testnet:

- **Forge the proof** (tamper one byte of the Groth16 seal): the on-chain BN254 verifier traps with `Error(Crypto, InvalidInput)` ("bn254 G2: point not on curve"). The `borrow` call reverts. **Zero USDC moves.**
- **Replay a valid proof:** the vault refuses to reuse it — the nullifier set blocks a second draw (`Error(Contract, #7 NullifierUsed)`), and against a stale checkpoint the freshness guard (`Error(Contract, #15 StaleCheckpoint)`) trips first. Either way **zero USDC moves**; one lock yields exactly one loan.

Try it live: the `/app` page has a "Try the cheat" button that runs a real tampered-proof simulation against the deployed vault and shows the actual trap.

## How it works

1. **Lock** collateral in the Ethereum (Sepolia) escrow under a hashlock `H`.
2. **Prove** (off-chain, RISC Zero): `locks[H].amount >= threshold` against a checkpointed Ethereum state root, with the amount and address kept secret. The STARK is wrapped to a 260-byte Groth16 (BN254) seal.
3. **Verify and borrow** (Stellar): the Soroban vault verifies the proof on-chain, checks the checkpoint and nullifier, sizes the loan from the live Reflector ETH/USDC price, and disburses real Circle USDC. The Stellar ledger only ever sees the threshold, never the amount.
4. **Repay** on Stellar reveals the secret `S`; a relayer submits `S` to the Ethereum escrow to unlock the collateral. **Default** (timeout or price) sends the collateral to the lender on Ethereum. No Stellar to Ethereum proof is ever required.

## On-chain verification (testnet)

| Contract | Network | Address |
|----------|---------|---------|
| VeilEscrow | Ethereum Sepolia (11155111) | [`0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F`](https://sepolia.etherscan.io/address/0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F) |
| VeilVault | Stellar Soroban testnet | [`CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV`](https://stellar.expert/explorer/testnet/contract/CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV) |
| RISC Zero Groth16 verifier | Stellar Soroban testnet | [`CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L`](https://stellar.expert/explorer/testnet/contract/CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L) |

- Real borrow (proof verified on Soroban, real Circle USDC disbursed): tx `026d4af681634b67acf4825f6a63f43d0c3c0d6804adeebcba2faf13a7b21e6e`
- Cross-chain unlock: repaying on Stellar reveals the secret `S`, which `claimRepaid(S)` uses to release the Sepolia collateral — proven end-to-end on testnet (the round-trip tx on the current vault is listed in [DEPLOYMENTS.md](DEPLOYMENTS.md)).
- Proof image id: `0xc1fb4c3a0ef6736f4abff926f44b37ff173724b5ff6e0deeea2236ca7577b245` · seal selector `73c457ba`
- The demo's Groth16 proof is generated for free on GitHub Actions (x86, 16 GB), no proving-network key required. A real user's *private* amount is never proven on public CI (its input would be world-visible); real-user proving routes to a private prover (Bonsai / self-hosted runner). See [web/PROVING.md](web/PROVING.md).

**Where a fresh borrow runs.** The hosted site **https://veilzk.vercel.app** serves the full UI, all live on-chain reads (`/api/state`), and the real on-chain cheat-fail (`/api/cheat`). Generating a *new* proof needs the `gh` CLI and the Stellar admin key, which live on a keyed host, not on Vercel — so on the hosted site the proving backend honestly reports `unavailable` (503) rather than faking a proof. A fresh end-to-end borrow is run from that keyed host (or locally). See [web/PROVING.md](web/PROVING.md).

## Tech stack

- **ZK:** RISC Zero zkVM (Rust guest verifies an `eth_getProof` account + storage proof via `alloy-trie`), Groth16-BN254 wrap.
- **Stellar:** Soroban (soroban-sdk) lending vault + the Nethermind RISC Zero verifier; Protocol 25/26 BN254 host functions; Reflector oracle; Circle USDC via the Stellar Asset Contract.
- **Ethereum:** Solidity + Foundry escrow on Sepolia.
- **App:** Next.js 15 (App Router), React 19, TypeScript; live reads via `@stellar/stellar-sdk` + `viem`; MetaMask + Freighter.

## What is real vs trusted (we never say "trustless")

Real and non-custodial: the collateral proof is cryptographic, the amount is hidden, on-chain verification gates real USDC, and default enforcement lives on Ethereum where the collateral lives. Disclosed trust: a checkpoint poster (a ZK light client is named future work), the Ethereum-side price oracle, the loan-sizing oracle, and a sane timeout. The privacy we ship is **Stellar-side confidentiality** (your amount and wallet never appear on Stellar); the hashlock is public on both chains, so hiding the Ethereum-side correlation is future work. Testnet, unaudited, demo-grade.

## Run locally

```bash
# App (live reads against testnet; no keys needed)
cd web && pnpm install && pnpm dev      # http://localhost:3000

# Ethereum escrow tests
cd contracts/escrow && forge test       # 12/12

# Soroban vault tests
cd contracts/vault && cargo test        # 12/12
```

## Repo layout

```
contracts/escrow   Sepolia escrow (Foundry)
contracts/vault    Soroban lending vault (soroban-sdk)
guest              RISC Zero guest + host + real proof fixture
relayer            checkpoint poster + secret-reveal relayer
web                Next.js thin client (/ landing + /app workspace)
SCOPE.md           locked charter · ARCHITECTURE.md  build spec
```

## License

MIT. See [LICENSE](LICENSE).
