# Veil — Live Deployments & Fixtures

## Sepolia (Ethereum testnet, chainId 11155111)
- **VeilEscrow**: `0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F`
  - deploy tx: `0x496db21e5a9f5780c464455a8f31289833d8cf27701ad92f6615add7b55bde8a`
  - lender (default recipient): `0xe9179cEf73A5Bf26928bC50013A88cdB618b0Caf`
- Deployer (throwaway, testnet-only, in gitignored `contracts/escrow/.env`):
  `0xe9179cEf73A5Bf26928bC50013A88cdB618b0Caf` (~2.18 ETH after deploy+lock)
- RPC: Alchemy Sepolia (in `.env`, supports `eth_getProof`)

### Live lock fixture (the guest's dev-mode input)
- secret S: `0x7777…7777` (32×0x77)
- hashlock H = keccak256(S): `0x23fed9f9c79709bc1257b712c83b3e44d4d3026207cdcce97f7512786f08a315`
- lock tx: `0x41d0d7f1f34b0864be0515cb718508d93dcc8513cd06a96da0112088e571df9f` (0.01 ETH = 1e16 wei)
- amount storage slot (= keccak256(abi.encode(H, 0)) + 1):
  `0x8ff196dc4032faa35ee0903b619ccadba3959ea6b3c69a7ad93c591429396f65`
- **pinned block 11143924** · state_root `0xe8ad78ff206153c2f2bf9767b2af9bb05ebae1aafd64cb73bfeb4968dc21a851`
  · block_hash `0xb54d1180557be165f348b0567e8dc2e1b8ef1b6428a12e5ce0500928e2550d09`
- escrow account storageHash `0x61d18d4e062c2265cf5ae3b7da2dbfa7db9bb6ebb1eae4868b0ceeb353b89896`
- full `eth_getProof`: `guest/fixtures/eth_getproof_pinned.json` (8 account + 2 storage MPT nodes, value 1e16)

## Stellar (Soroban testnet)
- **Phase 0a Groth16 verifier** (standalone, RISC Zero v3.0.0 params):
  `CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L`
  - valid-proof verify tx: `76f0e3f4698fb34ae9e3df088eb9f379158f1dd9888043ce7ed59acf35845c84`
- **VeilVault** (LIVE): `CBK7UNIOLBKWJ3N63W53AHPN4WBPLJL6CGDAUER6VB5BMCKBNBGRMAJ2`
  - init tx `f6df0b62a7a5cc1d0a8abe78b57b53da7682b98ad12479065e10d38c8e44715d`
  - config: verifier=mock (swap to real at 0b), image_id `0x56be4e8f…05edf3e0`, escrow `b833ff…bd6f`,
    usdc=Circle SAC, reflector=ETH feed, asset Other("ETH"), LTV 5000 bps, min 0.001 ETH, term 7d
  - checkpoint posted: block 11143924 → state_root `0xe8ad78ff…dc21a851` (tx `d961df55…`), verified on-chain
- **MockVerifier** (interim, selector 73c457ba): `CAMAIMZBQLHJXBSMLG7SOWBUOHJ7XYONF5YQZ5TFOVB2UCGWYIMAJY2C`
  - mock seal for our real journal: `73c457ba914bd44228ac50ba59e3dc529925f963376510ed326cbdd3382256d35be98768`
  - journal_digest `88828a8c7ed01db4e27e4783bf082219aac66cf7bd42b116db2850edba2c8ecd`
- Reflector ETH price live: `158020533336099617` (=$1580.21 @ 14 decimals)
- veil-spike USDC trustline: established (balance 0 — awaiting Circle faucet to fund the live borrow)
- spike identity `veil-spike`: `GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF`
- Circle USDC SAC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Reflector ETH/USDC feed: `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`

## Still pending (credentials)
- Bonsai (`BONSAI_API_KEY` + `BONSAI_API_URL`) → Phase 0b only.
