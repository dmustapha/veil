/**
 * Public, non-secret on-chain coordinates for Veil v3 (the live cross-chain suite from DEPLOYMENTS.md
 * "Phase 7-real"). Real WETH is escrowed on Ethereum Sepolia; an Axelar-authenticated `(commitment,
 * amount)` attestation crosses to a Soroban pool; the shielded borrow is a client-side Groth16 proof
 * verified natively on Stellar. NEVER add a private key or the real collateral amount here.
 */

export const SOROBAN_RPC = "https://soroban-testnet.stellar.org";
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export const SEPOLIA_CHAIN_HEX = "0xaa36a7";
/** Dedicated Sepolia HTTP RPC for READS (balances, allowances, receipts). Reads must NOT go through the
 *  injected wallet: in browsers with multiple wallet extensions (MetaMask + Backpack + …) `window.ethereum`
 *  is contested and can reject `eth_call` with -32602. A fixed HTTP endpoint is immune to that. Writes
 *  still go through the wallet (it holds the key). Override with NEXT_PUBLIC_SEPOLIA_RPC if needed. */
export const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";

// ---- Ethereum (Sepolia) ----
/** Canonical WETH (real wrapped ETH — `deposit{value}` wraps 1:1, no mint). */
export const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
/** VeilEthLock: escrows WETH bound to a note commitment, verifies the opening proof ON Ethereum, and
 *  Axelar-attests `(C, amount)` to the Soroban pool. */
export const VEIL_ETH_LOCK = "0x06bB519A490030DE251EeB83818F875Cc87002e0";
/** snarkjs Groth16 verifier for the `deposit_from_eth` opening proof (public `[amount, C]`). */
export const DEPOSIT_VERIFIER = "0xfe346c22f793032a1f5d3ba18d940fe27e9fc19f";
/** Axelar Sepolia gateway + gas service that `VeilEthLock.lock` routes the attestation through. */
export const AXELAR_GATEWAY_SEPOLIA = "0xe432150cce91c13a887f7D836923d5597adD8E31";
export const AXELAR_GAS_SERVICE_SEPOLIA = "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6";

/** Axelar prepaid gas (native ETH) for the cross-chain attestation `VeilEthLock.lock` emits.
 *  Matches the proven Phase-7 run (0.01 ETH); U10 can tune it if testnet gas shifts. */
export const AXELAR_GAS_WEI = 10_000_000_000_000_000n; // 0.01 ETH

/** Public collateral floor the borrow proves the hidden amount clears (0.005 ETH in wei). The exact
 *  amount is NEVER published; the proof reveals only that the note is worth at least this. */
export const PUBLIC_THRESHOLD_WEI = 5_000_000_000_000_000n; // 0.005 ETH

// ---- Soroban (testnet) ----
/** veil-pool: receives the Axelar-authenticated deposit (`execute`) and holds the append-only note tree. */
export const VEIL_POOL = "CA7H5WQISBIWVEWXRBTGHSB3UMEFK7RR4QJHYGAMZVEV7NSW3MFJLHLN";
/** veil-vault: verifies the client borrow proof and disburses real Circle USDC. */
export const VEIL_VAULT = "CAXOQQ7V4ZDI5TO5SJQQLGXHMWATL3VXXG5YBZJ33SCR7IJ3C7JRYBPT";
/** Native Soroban Groth16 (BN254) verifiers the pool/vault call into. */
export const VEIL_BORROW_VERIFIER = "CBTSWUY5OME4EDY3YA7OBRXHVMSBZH4MWO4GSGNPR4FAGG36RGQGDMM2";
export const VEIL_LOCK_VERIFIER = "CA4XWFDN4BDKRDVJ43IQLFQ6IGMU477OAEQXBYFCX2NQ7JWVJHE5A4TE";
export const VEIL_RELEASE_VERIFIER = "CDH7TOPQL2X3UW6SQNGRSOAOKLRI2QNQU6A3VDHJR2JQDNWMCSS2GLCB";

/** Circle USDC Stellar Asset Contract (testnet SAC). The real token a borrow disburses. */
export const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/** USDC on Stellar uses 7 decimals. */
export const USDC_DECIMALS = 7;
