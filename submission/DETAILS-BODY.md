**Keep your ETH on Ethereum. Get working USDC on Stellar. Veil moves the proof, never the collateral, and reveals neither your amount nor your wallet.**

*Stellar hackathon, Real-World ZK track.*

## The Problem

You hold ETH on Ethereum, and you want to put it to work on Stellar, where Circle USDC and the fast, low-cost rails live. Getting there today means moving your ETH across chains or selling it, and either way you give up the position you meant to keep, whether you are long ETH, holding it in cold custody, or already earning on it in Ethereum DeFi.

The usual way to avoid that, borrowing against your ETH instead of selling it, works on Ethereum but leaks everything. Overcollateralized lending on a public chain lets anyone read the exact collateral you lock, the size of your loan, and the wallet that ties it all back to you. For anyone managing real size, that is a standing liability: front-running, targeting, and a permanent public record of every position you hold. So today you are stuck choosing: keep your ETH where it is or reach liquidity on Stellar, and take the loan or keep it private.

## The Solution

Veil unlocks Stellar liquidity from your Ethereum ETH without moving it. You lock real ETH on Ethereum and borrow real USDC on Stellar against it. The collateral never bridges: only a commitment, an amount, and a zero-knowledge proof cross between chains, so you keep custody of your ETH on Ethereum while you operate with USDC on Stellar. That same proof, generated in your browser and verified natively on Stellar, attests that your hidden collateral clears the required threshold, so your amount and your identity stay private. The key technical claim: no relayer and no committee decides whether you can borrow. A Groth16 proof, verified on-chain, is the only thing Stellar trusts.

## How It Works

**1. Lock collateral on Ethereum.** You escrow real WETH in `VeilEthLock`, bound to a note commitment, with a client-side proof that attests the deposit opening on-device.

**2. Attest across chains with Axelar.** `VeilEthLock` emits an Axelar GMP message carrying `(commitment, amount)`. Axelar's validator set confirms the Ethereum lock and delivers it to the Soroban pool, which mints a shielded note.

**3. Prove and borrow privately.** In the browser you generate a Groth16 proof that your hidden collateral clears the threshold, then call `veil-vault.borrow`. The vault verifies the proof natively (BN254 on Soroban) and disburses real Circle USDC.

**4. Repay and reclaim.** Repay the USDC on Stellar, prove `release_repaid`, and your real WETH unlocks back on Ethereum. Only the proof crosses. The collateral never left Ethereum.

## Key Features

- **Client-side zero-knowledge proving:** every proof is generated on your device in seconds. Your amount and your address never leave the browser.
- **Native on-chain verification:** Groth16 over BN254, verified inside Soroban (Protocol 27). No trusted verifier service sits in the path.
- **Collateral that never bridges:** real ETH stays on Ethereum. Only a commitment, an amount, and a proof cross via Axelar GMP.
- **Selective disclosure:** Stellar learns only that you cleared a threshold, never how much you hold or which wallet is yours.
- **Solvency enforced by math:** a forged or replayed proof fails BN254 verification on-chain, and the vault reverts before any USDC moves.

## Live Now

- **Live app:** https://veilzk.vercel.app (both wallets, full flow, proving on-device)
- **Real WETH locked on Ethereum Sepolia:** tx `0x4fa09246a74fb6463c49b35fd3233459a0984a0ad53349603be3868db77cc959`
- **Cross-chain attestation delivered to Stellar via Axelar:** execute tx `bdc2af52b1382a375bcc73dd05b42929de777e66b44c928a1a6af91c9a40fe27`
- **Real USDC borrowed against a ZK proof:** Circle USDC disbursed on Stellar to the borrower, verified against `veil-vault`
- **Both ZK provers verify live on-chain:** the lock proof and the release proof, plus on-chain rejection of a tampered proof
- **Open source:** https://github.com/dmustapha/veil

## Tech Stack

`Circom` + `Groth16` (BN254) circuits, proven client-side with `snarkjs` in the browser, verified natively by `Soroban` (Rust, Protocol 27) BN254 verifier contracts. `Poseidon2` commitment tree. `Axelar` GMP for cross-chain attestation. `VeilEthLock` in Solidity (Foundry) on Ethereum Sepolia. `Reflector` price oracle. Next.js, viem, and Freighter on the client.

## Deployed Contracts

Ethereum Sepolia (chainId 11155111):
- VeilEthLock: `0x06bB519A490030DE251EeB83818F875Cc87002e0`
- Deposit verifier: `0xfe346c22f793032a1f5d3ba18d940fe27e9fc19f`

Stellar testnet (Soroban, Protocol 27):
- veil-pool: `CA7H5WQISBIWVEWXRBTGHSB3UMEFK7RR4QJHYGAMZVEV7NSW3MFJLHLN`
- veil-vault: `CAXOQQ7V4ZDI5TO5SJQQLGXHMWATL3VXXG5YBZJ33SCR7IJ3C7JRYBPT`
- Borrow verifier: `CBTSWUY5OME4EDY3YA7OBRXHVMSBZH4MWO4GSGNPR4FAGG36RGQGDMM2`
- Lock verifier: `CA4XWFDN4BDKRDVJ43IQLFQ6IGMU477OAEQXBYFCX2NQ7JWVJHE5A4TE`
- Release verifier: `CDH7TOPQL2X3UW6SQNGRSOAOKLRI2QNQU6A3VDHJR2JQDNWMCSS2GLCB`

## Business Model

- **Borrow-side spread:** a small margin on the interest rate, the standard revenue line for a lending market.
- **Privacy as the moat:** the first lending venue where a large position does not become a public target.
- **Cross-chain reach:** collateral held on a major L1, liquidity drawn on Stellar's low-fee rails.

## Hackathon Alignment

Primary track: Real-World ZK. Veil puts zero-knowledge proofs to real economic work, private and solvent lending, verified natively on Stellar. Real assets on both sides: WETH collateral on Ethereum and Circle USDC loans on Stellar, live on testnets today.

## Try It

Live app: https://veilzk.vercel.app . Code: https://github.com/dmustapha/veil . Verified on-chain: WETH lock `0x4fa09246a74fb6463c49b35fd3233459a0984a0ad53349603be3868db77cc959`, Stellar delivery `bdc2af52b1382a375bcc73dd05b42929de777e66b44c928a1a6af91c9a40fe27`.
