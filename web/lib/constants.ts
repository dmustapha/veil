/**
 * Real, on-chain values for Veil v3. Single source of truth for display copy.
 * Sourced from DEPLOYMENTS.md "Phase 7-real". NEVER add the real collateral amount here
 * (privacy invariant): only the public threshold is ever rendered.
 */

export const COPY = {
  wordmark: "Veil",
  track: "Real-World ZK",
  tagline:
    "Borrow on Stellar against collateral you keep on Ethereum, proven by a zero-knowledge proof that hides your amount and your identity. The collateral never bridges; the proof, not a relayer, is what Stellar trusts.",
  privacyLead:
    "The Stellar side never learns your Ethereum amount or address. The ledger, the lender, and every observer see only",
  publicSet: "{ threshold, commitment, nullifier, proof }",
  privacyTail: ", never how much you hold or which wallet is yours.",
} as const;

export const POSITION = {
  collateralChain: "Ethereum (Sepolia)",
  lendingChain: "Stellar (Soroban)",
  thresholdEth: "0.005 ETH",
  thresholdWei: "5e15 wei",
  reflectorPrice: "$1,740",
  ltv: "70%",
  loanUsdc: 6.05,
  balanceStart: 0.0,
  balanceEnd: 6.05,
} as const;

export const PROOF = {
  system: "Groth16 over BN254",
  size: "256 bytes",
  /** A (G1, 64B) ‖ B (G2, 128B) ‖ C (G1, 64B) — the on-chain proof byte layout. */
  layout: "A · B · C",
  curve: "BN254",
  verifiedOn: "Soroban (Protocol 27)",
} as const;

export const CHEAT = {
  forged: {
    code: "Error(Contract, #0)",
    reason: "InvalidProof — the Groth16 proof fails BN254 verification on Soroban, so the vault reverts before any USDC moves",
  },
  replay: {
    code: "nullifier already spent",
  },
  wrongRecipient: {
    code: "Error(Contract, #9 WrongBorrower)",
    reason: "the borrow proof is bound to one Stellar account; nobody else can redeem it",
  },
} as const;

const SEPOLIA_ADDR = (a: string) => `https://sepolia.etherscan.io/address/${a}`;
const SEPOLIA_TX = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
const EXPERT_CONTRACT = (c: string) => `https://stellar.expert/explorer/testnet/contract/${c}`;
const EXPERT_TX = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;

export const DEPLOYED = {
  ethLock: {
    label: "Sepolia WETH lock",
    chain: "eth" as const,
    addr: "0x81078A116b93Da170BB4f7B6282F7a26566e8933",
    href: SEPOLIA_ADDR("0x81078A116b93Da170BB4f7B6282F7a26566e8933"),
    explorer: "Etherscan",
  },
  pool: {
    label: "Soroban pool",
    chain: "xlm" as const,
    addr: "CBDCEWCXXM6QFGKWA466RF2I5LNY5N2CKMVKLCBIQUXOK5IK5W5INJAQ",
    href: EXPERT_CONTRACT("CBDCEWCXXM6QFGKWA466RF2I5LNY5N2CKMVKLCBIQUXOK5IK5W5INJAQ"),
    explorer: "Stellar Expert",
  },
  vault: {
    label: "Soroban vault",
    chain: "xlm" as const,
    addr: "CB7PH2V266O5GKLPP7CC5VE2LC5RLN5KXHTN6ETR2Y5JWIJIA3XP2TT2",
    href: EXPERT_CONTRACT("CB7PH2V266O5GKLPP7CC5VE2LC5RLN5KXHTN6ETR2Y5JWIJIA3XP2TT2"),
    explorer: "Stellar Expert",
  },
  verifier: {
    label: "Groth16 borrow verifier",
    chain: "xlm" as const,
    addr: "CBTSWUY5OME4EDY3YA7OBRXHVMSBZH4MWO4GSGNPR4FAGG36RGQGDMM2",
    href: EXPERT_CONTRACT("CBTSWUY5OME4EDY3YA7OBRXHVMSBZH4MWO4GSGNPR4FAGG36RGQGDMM2"),
    explorer: "Stellar Expert",
  },
  lockTx: {
    label: "Real WETH lock (Ethereum)",
    chain: "eth" as const,
    addr: "0x4fa09246…b77cc959",
    href: SEPOLIA_TX("0x4fa09246a74fb6463c49b35fd3233459a0984a0ad53349603be3868db77cc959"),
    explorer: "Etherscan",
  },
  attestTx: {
    label: "Axelar delivery → Stellar",
    chain: "xlm" as const,
    addr: "bdc2af52…c9a40fe27",
    href: EXPERT_TX("bdc2af52b1382a375bcc73dd05b42929de777e66b44c928a1a6af91c9a40fe27"),
    explorer: "Stellar Expert",
  },
  borrowTx: {
    label: "Borrow → 6.05 USDC (Stellar)",
    chain: "xlm" as const,
    addr: "3a3bb9b5…044cd8a3",
    href: EXPERT_TX("3a3bb9b53b1f40f687b9c8bff5606dd1642a9cf3896243cc02bdcd1c044cd8a3"),
    explorer: "Stellar Expert",
  },
} as const;

export const SITE = {
  networks: "Ethereum Sepolia + Stellar testnet",
  live: "https://veilzk.vercel.app",
} as const;
