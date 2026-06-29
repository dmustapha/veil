/**
 * Public, non-secret on-chain coordinates for Veil's live reads.
 * Full contract addresses (constants.ts holds truncated *display* forms).
 * The seal + journal are public proof data (RISC Zero Groth16 artifact), not secrets.
 * NEVER add a private key or the real collateral amount here.
 */

export const SOROBAN_RPC = "https://soroban-testnet.stellar.org";
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

/** Resolve the Sepolia RPC: env override, else a public node (reads only). */
export const sepoliaRpc = () =>
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_HEX = "0xaa36a7";

/** Current deployment: borrower-bound 172-byte journal (DEPLOYMENTS.md). */
export const VAULT = "CDPYUWKD5OTYVWK6C3FQC2OEB3XK4DRAI7WJ5C3XQW6TY3UV2JQWFX2D";
export const REFLECTOR =
  "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63";
export const VERIFIER =
  "CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L";
export const ESCROW = "0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F";
export const BORROWER =
  "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF";

/** Circle USDC Stellar Asset Contract (testnet SAC). The real token a borrow disburses. */
export const USDC_SAC =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/** Reflector price feed asset: Other(Symbol("ETH")). */
export const REFLECTOR_ASSET_SYMBOL = "ETH";

/** Hashlock H that keys this loan / escrow lock (public on both chains). */
export const HASHLOCK =
  "0x23fed9f9c79709bc1257b712c83b3e44d4d3026207cdcce97f7512786f08a315";

/** Real 172-byte journal committed by the guest: {state_root, block, escrow, threshold, hashlock,
 * nullifier, recipient}. No amount, by design; recipient = keccak256(borrower strkey) binds the loan. */
export const JOURNAL_HEX =
  "0xe8ad78ff206153c2f2bf9767b2af9bb05ebae1aafd64cb73bfeb4968dc21a8510000000000aa0af4b833ffec3c1a3a0ab71a9c014fd174ba7f1ebd6f00000000000000000011c37937e0800023fed9f9c79709bc1257b712c83b3e44d4d3026207cdcce97f7512786f08a315ee691cef0ead1c90b7b19c3e0078756b54715218060f78d992cb8c784174d9f1835ae6dade543458b5da8d6bbe9972c06dcfe8145b68b71f92b9939f4717301e";

/** Real 260-byte Groth16 seal (selector 73c457ba + proof points A,B,C). */
export const SEAL_HEX =
  "0x73c457ba148f8a212786bcf81b8faf272e2b942a416269ecd6dd85ba1f379250e28d106b058064d3c4fcdf5b0d6879c4c57cd979d06b16dbf166560c4eba0d870eaa124920ba682411293c42db006bacff94d853aeaac7e7ea3fd83895f9a56ee6d25fd90767aab1d2dc24482872cbf118aff6cd3c2836d2ac935bdf2e7cbeb6e69674c5156ae2fad2ee8d9692f06ccc0b8ebcc8d57529c7b1eea5ad63cee94025974081049403b18114ef6db3a27ad1c48d28f695f021242998a076ad98f9d4908249b32cb82f8c0ba30837770e8b655997eb499d0657a2c9d995dc553a3d7f779b549e1b789b960448a27df6a75bce810bfb18a5c2747bf50d4b1e110b81ae604e7efc";

/** USDC on Stellar uses 7 decimals; Reflector reports ETH/USD at 14. */
export const USDC_DECIMALS = 7;
