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
  reflectorPrice: "$1,575.61",
  ltv: "70%",
  loanUsdc: 1.19,
  balanceStart: 0.04,
  balanceEnd: 1.23,
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
    addr: "0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2",
    href: SEPOLIA_ADDR("0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2"),
    explorer: "Etherscan",
  },
  pool: {
    label: "Soroban pool",
    chain: "xlm" as const,
    addr: "CDIHDUDQIODLZOJAOCZA7DFIHYSX4C37N42RRFWQRC6NN6P7V6263WTB",
    href: EXPERT_CONTRACT("CDIHDUDQIODLZOJAOCZA7DFIHYSX4C37N42RRFWQRC6NN6P7V6263WTB"),
    explorer: "Stellar Expert",
  },
  vault: {
    label: "Soroban vault",
    chain: "xlm" as const,
    addr: "CCXGKWB5BQFPIJFARYYIB4FBQPLHGFBVANWHFODMQDRHPF2E3K6DCNKF",
    href: EXPERT_CONTRACT("CCXGKWB5BQFPIJFARYYIB4FBQPLHGFBVANWHFODMQDRHPF2E3K6DCNKF"),
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
    addr: "0x69032063…d84d7f9",
    href: SEPOLIA_TX("0x6903206311608c7d73396c533bab95da1a35f8692f140db9f1105d562d84d7f9"),
    explorer: "Etherscan",
  },
  borrowTx: {
    label: "Borrow → 1.19 USDC (Stellar)",
    chain: "xlm" as const,
    addr: "61dafbc3…d51912b",
    href: EXPERT_TX("61dafbc30c168b3254f32c864e55a37569c3d60762df0c2170ca8e0e8d51912b"),
    explorer: "Stellar Expert",
  },
} as const;

export const SITE = {
  networks: "Ethereum Sepolia + Stellar testnet",
  live: "https://veilzk.vercel.app",
} as const;
