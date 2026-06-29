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

## Phase 0b — REAL proof, REAL verifier (COMPLETE, no Bonsai key needed)
Real Groth16 proof generated free on GitHub Actions (`dmustapha/veil`, run 28265702811, x86/16GB).
- real seal (260 bytes, selector `73c457ba` — matches the deployed verifier): `guest/fixtures/real-proof.json`
- **real image_id** `0xd8368730bfd97adc0de554c6007a2ad784cc48f4f642347987fe8ba0cd48909d`
- **VeilVault (REAL)**: `CAV46LV53POIPZIF3HUPM6CELV5ZWBFHKSFJ74HFDY6HM7UNOK6JWJJY`
  - verifier = real Phase 0a Groth16 verifier `CDZRHQMX…FP5E5C2L` (3.0.5 seal verified against 3.0.0 params — compatible)
  - init `b2150da6…`, checkpoint `23da6ebd…`
- **REAL borrow** (real proof → real BN254 verify → USDC): tx `9de6c0af56df25c59572aa6ce764cfbefd9eb56418db75cc4ae8f0da66f8bd66`
  - disbursed 39301529 (3.93 USDC; live ETH price), borrower 0 → 3.93, vault 5 → 1.07
- **cheat-fails, real verifier**: tampered seal → `Error(Crypto, InvalidInput)` (BN254 pairing trap), borrow reverts, 0 USDC moved.

Bonsai key NOT required — the free GitHub Actions x86 runner produced the real proof.

## Post-DEBUG: hardened vault + fixed guest (CURRENT)
After the security audit fixed the CRITICAL guest slot-binding bug, the guest was re-proved (run
28270372443) and the hardened vault re-deployed.
- **fixed guest image_id** `0xc1fb4c3a0ef6736f4abff926f44b37ff173724b5ff6e0deeea2236ca7577b245`
- new real proof: `guest/fixtures/real-proof.json` (seal selector `73c457ba`)
- **VeilVault (HARDENED, CURRENT)**: `CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV`
  - verifier = real Phase 0a verifier `CDZRHQMX…FP5E5C2L`, LTV 25% (fit remaining test USDC)
  - **REAL borrow with fixed proof**: tx `026d4af681634b67acf4825f6a63f43d0c3c0d6804adeebcba2faf13a7b21e6e`
    (disbursed 19714162 = 1.97 USDC; borrower 0.93→2.90)
  - cheat-fails on hardened vault: tampered proof → `Error(Crypto, InvalidInput)` revert
  - adds: checkpoint freshness guard, Reflector staleness check, CEI ordering
- Prior vault `CAV46LV5…WJJY` (pre-hardening) superseded by the above.

## Post-rebake — borrower-bound journal + tightened oracle (CURRENT)
Pre-submission TIER 2: the journal now binds the borrower (closes the bearer-redeemable-proof hole,
H-B) and the oracle staleness window dropped 24h → 30min. The guest changed, so image_id re-baked
(CI run 28327243896) and the vault was redeployed.
- **fixed guest image_id** `0x494bfee75ad39a6f61e13f496af1ca2b798cca229ef94c5a094723c9901207ad`
  (172-byte journal: `{state_root, block, escrow, threshold, hashlock, nullifier, recipient}`)
- new real proof: `guest/fixtures/real-proof.json` (seal selector `73c457ba`, recipient bound to veil-spike)
- **VeilVault (CURRENT)**: `CDPYUWKD5OTYVWK6C3FQC2OEB3XK4DRAI7WJ5C3XQW6TY3UV2JQWFX2D`
  - verifier = real Phase 0a verifier `CDZRHQMX…FP5E5C2L` (unchanged; seal selector matches), LTV 25%,
    `MAX_PRICE_AGE_SECS` 1800
  - checkpoint posted: block 11143924 → state_root `0xe8ad78ff…dc21a851`
  - **REAL borrow (borrower-bound)**: tx `dc5c1719cc20a5d00c7bb0534b2520b40f7388fa879f1927ba123bee3b6694a6`
    (disbursed 19686478 = 1.97 USDC to veil-spike; vault 2.90 → 0.93)
  - **cheat-fails, all proven live on this vault**:
    - tampered seal → `Error(Crypto, InvalidInput)` (BN254 trap), 0 USDC moved
    - replay valid proof → `Error(Contract, #7 NullifierUsed)` (checkpoint fresh, so #7 fires before #15)
    - thief redeems the proof to another account → `Error(Contract, #17 WrongRecipient)`, 0 USDC moved
- Prior vault `CBICAWGA…WVGILV` (140-byte journal, no recipient) superseded by the above.

## Proof-as-authorization — Soroban custom account (`__check_auth`)
The Stellar-native move (SCOPE §7, formerly a stretch): a Soroban **custom account** whose
authorization IS a RISC Zero proof. `__check_auth` verifies the Groth16 seal on-chain (the same
BN254 verifier), checks the journal's `recipient` binding, and consumes the nullifier — so "the
proof is the signature." EVM has no protocol-level equivalent (ERC-4337 is app-level), which is
what makes Stellar non-substitutable here. **No re-bake**: it reuses the borrower-bound 172-byte
journal (image_id `0x494bfee7…`, recipient `835ae6da…`).
- **VeilAccount**: `CCS6MVAC4FEGNE3RGJT7KBKH4J7HQEWERRTJOWD6R5YLYNIFWB7NUEIQ`
  (init: verifier `CDZRHQMX…`, image_id `0x494bfee7…`, recipient `835ae6da…`)
- **Probe** (triggers the account's `require_auth`): `CATFANE7LHSKAR566SR3J4CMUFEH3CEA6B6VYRPXYJEHZ6ZONEWBBIAX`
- **Real on-chain `__check_auth` tx** (proof authorized the call, BN254 verified inside auth):
  `dfd9b05525f4ed2bf2b23f5226fb337699996b29877fe4ed366ca24d6393e173` — **SUCCESS**
- **Budget**: the BN254 verify inside `__check_auth` cost **33,995,134 instructions** of the
  100,000,000 per-tx max (~34%) — fits with wide margin. (This was the open feasibility question;
  answered live.)
- Failure paths covered by `contracts/account` tests (try_invoke_contract_check_auth): forged seal
  traps, wrong recipient → `WrongRecipient`, replay → `ProofReused`.

## Live app (deployed)
- **https://veilzk.vercel.app** (Vercel, Next.js 15). Public, no auth. `/` landing + `/app` live workspace.
  - `/api/state` reads vault config/loan + Reflector price + escrow lock live (retry + cached fallback).
  - `/api/cheat` runs a live tampered-proof borrow simulation → real `Error(Crypto, InvalidInput)` trap.
