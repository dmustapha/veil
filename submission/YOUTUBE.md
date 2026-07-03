# Veil — YouTube upload details

## Title (pick one)
- Veil: Keep your ETH on Ethereum, borrow USDC on Stellar, privately (ZK)
- Veil: Private cross-chain lending. Move the proof, not the money.
- Veil: Borrow USDC on Stellar against ETH you never move (zero-knowledge)

Recommended: **Veil: Keep your ETH on Ethereum, borrow USDC on Stellar, privately (ZK)**

## Description

Keep your ETH on Ethereum. Get working USDC on Stellar. Veil moves the proof, never the collateral, and reveals neither your amount nor your wallet.

Veil is a private cross-chain lending protocol. You lock real ETH on Ethereum and borrow real Circle USDC on Stellar against it. The collateral never bridges: only a commitment, an amount, and a zero-knowledge proof cross between the chains. That proof is generated in your browser and verified natively on Soroban, so your collateral amount and your identity stay private. No relayer and no committee decides whether you can borrow. A Groth16 proof, verified on-chain over BN254, is the only thing Stellar trusts.

This video is an animated explainer. A live walkthrough of the app will follow.

How it works:
1. Lock collateral on Ethereum. Escrow real WETH in VeilEthLock, bound to a note commitment.
2. Attest across chains. Axelar carries only the commitment and amount to the Soroban pool.
3. Prove and borrow privately. Generate a Groth16 proof in-browser that your hidden collateral clears the threshold, then borrow. Soroban verifies it natively and disburses real Circle USDC.

Proven on-chain (testnet):
- Real WETH locked on Ethereum Sepolia: 0x4fa09246a74fb6463c49b35fd3233459a0984a0ad53349603be3868db77cc959
- Cross-chain attestation delivered to Stellar via Axelar: bdc2af52b1382a375bcc73dd05b42929de777e66b44c928a1a6af91c9a40fe27
- Around 6 real Circle USDC borrowed against a zero-knowledge proof
- Both provers verify live on-chain, and a tampered proof is rejected

Try it live: https://veilzk.vercel.app
Source: https://github.com/dmustapha/veil

Built for Stellar Hacks, Real-World ZK track.

Tech: Circom + Groth16 (BN254) circuits proven client-side with snarkjs, verified natively by Soroban (Rust, Protocol 27). Poseidon2 commitment tree. Axelar GMP for cross-chain attestation. VeilEthLock in Solidity (Foundry) on Ethereum Sepolia. Reflector price oracle. Next.js, viem, Freighter.

#ZeroKnowledge #Stellar #Soroban #DeFi #Privacy #Ethereum #Groth16 #ZK #Web3 #CrossChain

## Tags
veil, zero knowledge, zk, zk proof, groth16, bn254, stellar, soroban, ethereum, defi, private lending, cross chain, axelar, circle usdc, snarkjs, circom, poseidon, freighter, reflector, stellar hacks, real world zk, privacy, web3, blockchain, dapp

## Suggested settings
- Category: Science & Technology
- Visibility: Unlisted or Public (submission needs a shareable link)
- Audience: Not made for kids
- After upload: paste the YouTube link into the DoraHacks Profile "demo video" field

## Pinned comment (optional)
Live app: https://veilzk.vercel.app  ·  Code: https://github.com/dmustapha/veil
On-chain proof: WETH lock 0x4fa09246...c959, Stellar delivery bdc2af52...fe27.
