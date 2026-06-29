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
  imageId: "0x494bfee7…901207ad",
} as const;

export const CHEAT = {
  forged: {
    code: "Error(Crypto, InvalidInput)",
    reason: "bn254 G2: point not on curve",
  },
  replay: {
    code: "Error(Contract, #7 NullifierUsed)",
  },
  wrongRecipient: {
    code: "Error(Contract, #17 WrongRecipient)",
    reason: "the proof is bound to one Stellar account; nobody else can redeem it",
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
    addr: "CDPYUWKD5OTYVWK6C3FQC2OEB3XK4DRAI7WJ5C3XQW6TY3UV2JQWFX2D",
    href: "https://stellar.expert/explorer/testnet/contract/CDPYUWKD5OTYVWK6C3FQC2OEB3XK4DRAI7WJ5C3XQW6TY3UV2JQWFX2D",
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
    addr: "dc5c1719…6694a6",
    // full hash so the explorer link resolves
    href: "https://stellar.expert/explorer/testnet/tx/dc5c1719cc20a5d00c7bb0534b2520b40f7388fa879f1927ba123bee3b6694a6",
    explorer: "Stellar Expert",
  },
  unlockTx: {
    label: "Repay → unlock (Sepolia escrow)",
    chain: "eth" as const,
    addr: "claimRepaid(S)",
    // repay on Stellar reveals S; a relay submits S to the escrow's claimRepaid to release collateral
    href: "https://sepolia.etherscan.io/address/0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F#code",
    explorer: "Etherscan",
  },
} as const;

export const SITE = {
  networks: "Ethereum Sepolia + Stellar testnet",
  live: "https://veilzk.vercel.app",
} as const;
