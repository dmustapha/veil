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

/** Hardened, current deployment (DEPLOYMENTS.md). */
export const VAULT = "CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV";
export const REFLECTOR =
  "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63";
export const VERIFIER =
  "CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L";
export const ESCROW = "0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F";
export const BORROWER =
  "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF";

/** Reflector price feed asset: Other(Symbol("ETH")). */
export const REFLECTOR_ASSET_SYMBOL = "ETH";

/** Hashlock H that keys this loan / escrow lock (public on both chains). */
export const HASHLOCK =
  "0x23fed9f9c79709bc1257b712c83b3e44d4d3026207cdcce97f7512786f08a315";

/** Real journal committed by the guest: {state_root, block, escrow, threshold, hashlock, nullifier}. No amount, by design. */
export const JOURNAL_HEX =
  "0xe8ad78ff206153c2f2bf9767b2af9bb05ebae1aafd64cb73bfeb4968dc21a8510000000000aa0af4b833ffec3c1a3a0ab71a9c014fd174ba7f1ebd6f00000000000000000011c37937e0800023fed9f9c79709bc1257b712c83b3e44d4d3026207cdcce97f7512786f08a315ee691cef0ead1c90b7b19c3e0078756b54715218060f78d992cb8c784174d9f1";

/** Real 260-byte Groth16 seal (selector 73c457ba + proof points A,B,C). */
export const SEAL_HEX =
  "0x73c457ba1b4fe140c254160ae5421dc29c7b49a88b01dbb9b9d6d756aee25fc27579cff7206fae6394934d2e973d3689a7e7f01b32dc0ff20ca34b5b6aae414de81db44319595a52a090985fa9016558b0055d031aaa01e85907217df01f3f042c7d8aba02c909cf46a3426394a771e0ccf6439af62c844e7a60e17550f087cccc2f6c910bbe017b7311e28ba4e05e73f4841d943d231053186b08715ee4265724b3ca6b1c3e22b2e92d0268d71848436750dd66a8335bff9089922f7f83d1f9cc483c1d224e413c2987873a04e3567d0c52d2abf91a9e9aeaf11968d96560e19e60598d2fef3b15332152729688df399d454bbef79fa5a3e1c8187eeaa77cfe62d6bd2a";

/** USDC on Stellar uses 7 decimals; Reflector reports ETH/USD at 14. */
export const USDC_DECIMALS = 7;
