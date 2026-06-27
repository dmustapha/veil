/**
 * Real, on-chain values for Veil. Single source of truth.
 * Sourced verbatim from web/design/prompt.md and DEPLOYMENTS.md.
 * NEVER add the real collateral amount here (privacy invariant): only the
 * public threshold is ever rendered.
 */

export const COPY = {
  wordmark: "Veil",
  track: "Real-World ZK",
  tagline:
    "Borrow on Stellar against collateral you keep on Ethereum, proven by a zero-knowledge proof that hides your amount and your identity. The collateral never bridges; the proof, not a relayer, is what Stellar trusts.",
  privacyLead:
    "The Stellar side never learns your Ethereum amount or address. The ledger, the lender, and every observer see only",
  publicSet: "{ threshold, hashlock, nullifier, proof }",
  privacyTail: ", never how much you hold or which wallet is yours.",
} as const;

export const POSITION = {
  collateralChain: "Ethereum (Sepolia)",
  lendingChain: "Stellar (Soroban)",
  thresholdEth: "0.005 ETH",
  thresholdWei: "5e15 wei",
  reflectorPrice: "$1,575.61",
  ltv: "25%",
  loanUsdc: 1.97,
  balanceStart: 0.93,
  balanceEnd: 2.9,
} as const;

export const PROOF = {
  system: "Groth16 over BN254",
  size: "260 bytes",
  sealSelector: "73c457ba",
  imageId: "0xc1fb4c3a…7577b245",
} as const;

export const CHEAT = {
  forged: {
    code: "Error(Crypto, InvalidInput)",
    reason: "bn254 G2: point not on curve",
  },
  replay: {
    code: "Error(Contract, #7 NullifierUsed)",
  },
} as const;

export const DEPLOYED = {
  escrow: {
    label: "Sepolia escrow",
    chain: "eth" as const,
    addr: "0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F",
    href: "https://sepolia.etherscan.io/address/0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F",
    explorer: "Etherscan",
  },
  vault: {
    label: "Soroban vault",
    chain: "xlm" as const,
    addr: "CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV",
    href: "https://stellar.expert/explorer/testnet/contract/CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV",
    explorer: "Stellar Expert",
  },
  verifier: {
    label: "Groth16 verifier",
    chain: "xlm" as const,
    addr: "CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L",
    href: "https://stellar.expert/explorer/testnet/contract/CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L",
    explorer: "Stellar Expert",
  },
  borrowTx: {
    label: "Borrow transaction",
    chain: "xlm" as const,
    addr: "026d4af6…b21e6e",
    // full hash so the explorer link resolves
    href: "https://stellar.expert/explorer/testnet/tx/026d4af681634b67acf4825f6a63f43d0c3c0d6804adeebcba2faf13a7b21e6e",
    explorer: "Stellar Expert",
  },
  unlockTx: {
    label: "Cross-chain unlock",
    chain: "eth" as const,
    addr: "0x93464ef2…fd7824",
    // unlock landed on the escrow contract; link to its on-chain tx list
    href: "https://sepolia.etherscan.io/address/0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F",
    explorer: "Etherscan",
  },
} as const;

export const SITE = {
  networks: "Ethereum Sepolia + Stellar testnet",
  live: "veil.vercel.app",
} as const;
