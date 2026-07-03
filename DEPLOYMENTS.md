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

## v2 — private cross-chain margin lending (testnet deploy 2026-07-01)
Branch `v2-private-margin-lending`. Real Groth16 image_ids from CI run 28497850128.

**Ethereum (Sepolia, chain 11155111):**
- VeilPool `0x34F7cBCe7795CCd0F7C73C4e39c3d4474355f754`
- MockWstETH `0xD3dF2b1C007dD6F8f9feaf4AFBb7914B0286356A`
- verifier = RiscZeroVerifierRouter `0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187`
- relayer/deployer `0xe9179cEf73A5Bf26928bC50013A88cdB618b0Caf`
- image_ids: lock `0xd6856a9b…5d04fcd9` · unlock `0xee487c6b…6e9137f8` · seize `0x73d77cd1…efb8b7a0`
- anonymity set: 8 decoy deposits; pool root `0xc107b01d…4be568dc`; 5.6 wstETH exactly-backed (balance==totalDeposited)

**Soroban (testnet):**
- vault-v2 `CCUD2UR24NOCRXZVPZFL532N4UQ5QMDH4GCMJMGYKNINLA7V5D4I6TJ2`
- init: verifier `CDZRHQMX…5C2L` (Nethermind), borrow image_id `0xa614117f…69e3e9d0`, USDC `CBIELTK6…DAMA`, Reflector `CCYOZJCO…RN63` (Other ETH); ltv 2500 / liq 8000 / min_threshold 1 / term 120960 ledgers / rate 500 bps
- add_root `c107b01d…` (Ethereum pool root known); lp_deposit 10 USDC (total_assets 100000000)
- admin veil-spike `GABHHKTQ…FXIF`

Key txs: vault upload `f534b1b5`, deploy `f554a1f9`, init `8433aa4c`, add_root `d2042913`, lp_deposit `6e358361`.

## Veil v3 (Soroban-native) — Groth16 verifiers (Stellar testnet)

Circom→Groth16 (BN254) verifiers, one per joinsplit circuit, mirrored from Nethermind
`circom-groth16-verifier` (native `crypto::bn254` precompile). Deployer: `veil-spike`
`GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF`. Each embeds its own compile-time vkey
(`circom/keys/<circuit>.vk.json`).

- **borrow** verifier (current, sdk 27.0.0-rc.1 / protocol 27): `CBTSWUY5OME4EDY3YA7OBRXHVMSBZH4MWO4GSGNPR4FAGG36RGQGDMM2`
  - superseded: `CACSCTTX4PYTATZJM5EJEE6TAHRHA5LWCSWNPDAQW5I5GVZND422BEMC` (sdk 26) · `CBW4SZE4YCCVN7GNLUOO2Z2NOUDPALZBNAABAAX3CPLAD7WF3APPPVZU` (sdk 26, overflow-checks)
- **lock/unlock/seize** verifiers (Phase-3, **sdk 26 — SUPERSEDED** by the P27 set in the "v3 full
  contract suite" section below, which the deployed pool wires): lock `CDI7H3POM5PMBNV6DCDXB4M4LD63QKF2EIBEBU4I73EOGN66254C6BM5`
  · unlock `CDU7ZXX4NLMH66ZHFDEVQJQCBCOK4VWF7FSTTF6KE2BVJKNAAKNSHXTL` · seize `CAX3KGXJAO5YQ5EJ6EAJRI3NRFFC5CQIZYGNHO22B4ZLHSQGIQXZTUEP`.
  **Current (P27): lock `CD4LXCNP…SH6B` · unlock `CDIAVRLO…JSVQ` · seize `CCS6HBA3…FGHU`** (full IDs below).

### On-chain verification proof (ZK is load-bearing)
- `borrow.verify(real proof, real public signals)` → **`true`** (on-chain).
- `borrow.verify(same proof, tampered public[4]=borrower)` → **`Error(Contract, #0)` = InvalidProof**.
- `seize.verify(real proof, real public signals)` → **`true`** (a gated circuit, on-chain).

⚠️ Trusted setup is single-party (see `circom/ceremony.sh`) — testnet/demo only, NOT sound for real
funds. Mainnet requires a multi-party ceremony.

### v3 full contract suite (Phase 6c, Stellar testnet, sdk 27.0.0-rc.1 / protocol 27)
Deployer/admin `veil-spike` `GABHHKTQ…FXIF`. The complete Soroban-native private-lending system, live + wired:
- **veil-pool** (shielded note pool: deposit + lock/unlock/seize + nullifier set): `CADQ2QHEAT2OYDSHWHPNOA5FTHJGT4K44PYEY5S65LNI6WCHPTBFMBMR`
  - collateral token `CBIELTK6…DAMA` (USDC SAC), levels 16, verifiers wired, `set_vault` → veil-vault (tx `f71ecd03…`)
- **veil-vault** (ERC-4626 LP + borrow/margin/repay/liquidate): `CANIPKVDBYMLQVAEC3SYOUMQBCOJOQPFBA2UFSPKVMPUWHMZWISKSQNT`
  - borrow_verifier `CBTSWUY5…DMM2`, veil_pool `CADQ2QHE…MBMR`, usdc `CBIELTK6…DAMA`, reflector `CCYOZJCO…RN63` Other(ETH), ltv 7000 / liq 8000 / min_threshold 1e11 / term 500000 / rate 500
- **verifiers** (P27): lock `CD4LXCNPZLENGPJCNTSJBNH6MJZ6ZA6SQ7352UA3KNZBHQ3P2ESESH6B` · unlock `CDIAVRLOXCMMUAY2VCRLWUZLJVFCZAEZSRTOQ4XENTXEUOUGNF2WJSVQ` · seize `CCS6HBA3VUGILJIT77JG7XJWGYWW3QMFECUX67CZMJS4356Z42O7FGHU` (borrow above)

### Client-side (browser) proof verified on-chain (Phase 5)
A **browser-generated** Groth16 borrow proof (snarkjs `groth16.fullProve` over the vendored
`borrow.wasm`+`borrow.zkey`) verifies on the live verifier: `verify(proof, public_inputs) → true`,
tampered `public[4]` → `InvalidProof`. Reproduce: `cd web && pnpm verify:prover`.
- Encoding: proof `{a,b,c}` = Bytes (G1 64B / G2 128B `c1||c0`); `public_inputs` = **Array<u256>**
  (`Bn254Fr` marshals as ScVal::U256, not Bytes — the earlier trap was a client-side arg-encoding
  bug, never a verifier fault). Rebuilt against soroban-sdk 27.0.0-rc.1 to match testnet protocol 27.

## Veil v3 — Phase 6d hybrid live e2e (mock collateral + REAL USDC loan)
Phase 6d runs a full deposit→lock→borrow with a mintable private-collateral note and a REAL Circle
USDC loan. The circuit's collateral `amount`/`threshold` live at a ~1e11-units-per-collateral-unit
scale (`size_loan` divides `threshold` by 1e11), and the pool escrows `amount` of its collateral token
1:1 — so a borrowable note needs ≥1e11 collateral units, infeasible with ~10 real USDC. Resolution: the
COLLATERAL is a mintable mock SAC (VEILC, issued by veil-spike → unlimited issuance on transfer) while
the LOAN disburses REAL USDC_SAC. Fresh pool+vault (the 4 verifiers are token-agnostic, unchanged).

Deployer/admin `veil-spike` `GABHHKTQ…FXIF`, sdk 27.0.0-rc.1 / protocol 27:
- **VEILC** mock collateral SAC (issuer veil-spike): `CCZSYIZHEKQFDDTEI633FRXBHUBY4TG46N7SKJNNC3IJVBI3S2KZSVUB`
  - deploy tx `f56d25b88344f1eaa37b1b6c66fa01745f03efa4dae106d855d1a9495515aa92`. Issuer holds no
    balance (`balance()` = i128::MAX); `deposit`'s transfer ISSUES VEILC to the pool (no mint needed).
- **veil-pool** (collateral = VEILC, levels 16, verifiers lock/unlock/seize):
  `CDB6ZC4UYYCWCP5HMQEFBGEPJP7HO52A2L6LX5P6SYDRGKFA2MHOJAKW` (deploy tx `7a24fc83eb42ed18bafd5768deb84312d1c0ca41280b92e1d1dd43c0646fb482`)
- **veil-vault** (usdc = REAL USDC_SAC `CBIELTK6…DAMA`, veil_pool above, borrow_verifier `CBTSWUY5…DMM2`,
  reflector `CCYOZJCO…RN63` Other(ETH), ltv 7000 / liq 8000 / min_threshold 1e11 / term 500000 / rate 500):
  `CBSZGP4UJK4LHWJD64HORNOHMZPE4F3O3WYUPXWWA2WWIUSUIP3GEMWJ` (deploy tx `eae71a2e5df5d542ee9738e063fdfc182414844c8cfb6633683db18f3abff4b4`)
  - `pool.set_vault` tx `b5c8e3527be97addc26bad1ab74761ad4c00deb8fee863371fbe73def226139e`
  - `lp_deposit` 9 real USDC (90000000) tx `70506df07866a1cfd84db35c89d7a6acac5a48e6140a074fb997de9e246a089e` → vault total_idle 90000000

### Live deposit→lock→borrow (client-side proofs, REAL USDC disbursed)
The full lifecycle, every proof generated client-side by the browser prover (`web/lib/prove/`,
`web/scripts/e2e/`) and each spend verified on-chain by its deployed verifier:
- **deposit** tx `c9674877f718d6b12081da81ddc3966ccaaab19fd2eef3474c4277bbe95ef669` — AVAILABLE note
  (amount 2e15 VEILC, nk=5 spendPk, blinding 1) at **leaf 0**; `C_available` =
  `7530136360113033928878418794468993682904198215930852606036456759954079834832`; the issuer transfer
  issued 2e15 VEILC into the pool (`total_deposited` = 2e15 solvency floor).
- **lock** tx `933732e814d8373bbdf775089a8d139bfe53bf30c8a36315179f3a0a09857569` — a CLIENT-generated
  Groth16 lock proof verified on-chain (lock verifier `CD4LXCNP…SH6B`); nullifier
  `6332296964618480087551862317697555777946550233501958926381485656098543397117` burned; LOCKED note
  minted at **leaf 1** (`C_locked` = `6113537084864094179256913307414465815070903443018625700072789248813390003631`);
  new pool root `R1` = `3145978733278499968912379085763570999484930165071358457648666178471329315431`.
- **borrow** tx `a2cb861b72213231b2cac6789b9ca85445294f7de5902361156605d91c0747f3` — a CLIENT-generated
  Groth16 borrow proof (positionId `6878142553…057766`, lockHandle `6303898728…007978`, threshold 1e15)
  verified on-chain (borrow verifier `CBTSWUY5…DMM2`) → **REAL 1.1343694 USDC disbursed**
  (`11343694` stroops, vault→veil-spike; balance `14686478 → 26030172`). Position ACTIVE, floor 1e15,
  principal 11343694; vault idle `90000000 → 78656306`. Amount (2e15) stays hidden — only the 1e15
  floor is disclosed.
- **cheat-fails on-chain** (ZK load-bearing): the SAME borrow proof with a tampered `threshold`
  (1e15+1, an unproven floor) → the vault's borrow-verifier call returns `Error(Contract, #0)` =
  InvalidProof, escalated to a VM trap → the borrow reverts, **0 USDC moved** (balance unchanged). The
  proof binds the exact floor; you cannot claim one you did not prove.

## Veil v3 — Phase 7f cross-chain deploy (2026-07-02)
Real-ETH collateral leg. A borrower locks WETH on Sepolia (`VeilEthLock`, opening proof verified
on-chain by `DepositFromEthVerifier`); the eth-lock relayer mirrors each `Locked(C, amount, owner)`
into the Soroban `veil-pool.attest_lock`; the existing shielded lock→borrow then disburses REAL USDC.
The ETH never leaves Ethereum — only `(commitment, amount)` (via relayer) + the shielded borrow proof
(on Stellar) cross over. Reuses the P27 verifiers + USDC_SAC.

### Sepolia (chainId 11155111) — deployer `0xe9179cEf73A5Bf26928bC50013A88cdB618b0Caf`
- **DepositFromEthVerifier** (snarkjs Groth16, public `[amount, C]`): `0x69879b1E9841bb36bbccFc62eE67657DEe7E4bAe`
  - deploy tx `0x1c02b78d763b7ca41d7351815e6da44e109bc19efbdcb9f90e126b66f6773d4d`
- **MockWstETH** (WETH stand-in the borrower locks; freely mintable): `0x61d11466DB766932aea0B4E224fA9C91ecD0426A`
  - deploy tx `0x6b90570de1c5c4ca6c96c5c76e48d203fd1cd8722c14c88e3a666ae6000b0cb6`
- **VeilEthLock** (lock WETH + verify opening proof + emit `Locked`): `0x9Ea8A7a45C68b5c892D981E8375d15E8B8E9dd4D`
  - deploy tx `0x021b5aa88b245cfa2c2783e1995002007db2729d6bea069228db031215a315c6`
  - on-chain wiring confirmed: `weth()` = MockWstETH, `verifier()` = DepositFromEthVerifier, `totalLocked()` = 0
  - deployed via `forge script script/DeployEthLock.s.sol:DeployEthLock --broadcast`

### Soroban (testnet, sdk 27.0.0-rc.1 / protocol 27) — admin `veil-spike` `GABHHKTQ…FXIF`
- **veil-pool** (shielded note pool + `attest_lock`): `CCEGNNAATXEKCUWVDUHWE6LQSIOEYGGB5GXFCAG6L3KO33YZ4WCIGSLM`
  - deploy tx `773fa4980867bceaf318667fad8e0dfb777b031cc73d63ea3d7575b247820c8a`
  - constructor: admin `veil-spike`, token USDC_SAC `CBIELTK6…DAMA` (inert — the cross-chain path
    escrows nothing; `attest_lock` records `total_backed` instead), levels 16, verifiers (P27)
    lock `CD4LXCNP…SH6B` / unlock `CDIAVRLO…JSVQ` / seize `CCS6HBA3…FGHU`
  - `set_relayer(veil-spike)` (disclosed-trust cross-chain relayer, one-time) tx `fa41dcaa6050ec0e4e569137a5bae5e11a7818f9da5324b2b3da6159764f2a49`
  - `set_vault(veil-vault below)` tx `24d7014a65bbd1f351fdd699651871519a78942cddb411af523031408f5f8379`
  - fresh: `total_deposited` = 0; a second `set_relayer` traps (binding locked)
- **veil-vault** (ERC-4626 LP + borrow/margin/repay/liquidate): `CBOQBRWOFE6KOKHKEVRQU3753FXOT4VM2ND6FEOAVABBDOWUQLXVSFQ2`
  - deploy tx `d07208499bfa023b9d76ab21dc77f91b98abd6fc9e628fcc86c4382643a5c72c`
  - constructor: admin `veil-spike`, borrow_verifier `CBTSWUY5…DMM2` (P27), veil_pool `CCEGNNAA…GSLM`,
    usdc `CBIELTK6…DAMA`, reflector `CCYOZJCO…RN63` Other(ETH), ltv 7000 / liq 8000 / min_threshold 1e11 /
    term 500000 / rate 500
  - `lp_deposit` 2 USDC (20000000) tx `7f76869045c30b6e7600bbb4e3d9c1649e3396758c6798925d34934a11dbffbd` → `total_assets` 20000000
  - LP sized to 2 USDC (veil-spike's remaining balance; the 6d vault holds the earlier 9 USDC) — covers
    one ~1.13 USDC demo loan at the 6d threshold scale.
- Relayer wiring: `relayer/config.mjs` fallbacks + `contracts/escrow/.env` set `ethLock` /
  `poolV3` / `VEIL_VAULT_V3`. Run `cd relayer && node eth-lock-relayer.mjs` (one-shot) or `--watch`.

### Phase 7g — LIVE cross-chain e2e (real Sepolia WETH → REAL USDC, every proof client-side)
The full lifecycle ran end-to-end across both chains. The collateral is REAL WETH locked on Sepolia;
only the note commitment + amount cross to Stellar (via the relayer) and the shielded borrow proof
proceeds there. Reuses the 6d note (amount 2e15, nk=5) so the existing client lock/borrow provers are
unchanged — ONLY the deposit backing changed from a Stellar token escrow to a real Ethereum lock.

**Ethereum (Sepolia) — the collateral lock, opening proof verified on-chain:**
- opening proof (`deposit_from_eth`) generated client-side for the 6d note (`amount 2e15`, spendPk
  H1(nk=5), blinding 1) → `C_available` `7530136360…834832`; **verified `true` on the live
  DepositFromEthVerifier** (`verifyProof` view call) before locking.
- mint 1 WETH → deployer tx `0x814c33ec0218c4d6442bfcd169971c5fcd5af4724f47ef9c2b64abaf064c431c`
- approve VeilEthLock tx `0x8f0a3f3f57b4b4444fceb5929aec9a2e5e9f2e877a5c86fd85c93e94ad826de6`
- **lock 2e15 wei WETH** bound to `C_available` (opening proof verified in `VeilEthLock.lock`) tx
  `0xc345e1b10b2e71e2e60afd0a7198bc7d9a04c9c6b80a23c82a323b1707f7c1bb` (block 11185144) — `Locked`
  event emitted, `totalLocked` = 2e15, `isLocked(C)` = true. Real WETH escrowed on Ethereum.

**Soroban (testnet) — relayer mirror + shielded lock→borrow:**
- **attest_lock** (relayer `eth-lock-relayer.mjs`, source veil-spike) tx
  `0b40c7555a9d981adb321b70ebf8f6d86a2c9c2e5cf156ec32164b10240cf065` — `AttestLock` event, leaf 0,
  `commitment` = `C_available`, `amount` 2e15 → AVAILABLE note in the tree, `total_deposited` = 2e15
  (backing = the Ethereum lock; NO Stellar escrow). Pool root R0 `12581396…395474`.
- **lock** (CLIENT-generated Groth16 proof, verified on-chain by lock verifier `CD4LXCNP…SH6B`) tx
  `7535509317e8a3fb421a633f89e5459c1fe1102e05d55fc3b079d78d1846756e` — `Spent` event, nullifier
  `6332296964…397117` burned, LOCKED note at leaf 1 (`C_locked` `6113537084…003631`); new root R1
  `3145978733…315431`.
- **borrow** (CLIENT-generated Groth16 proof, verified on-chain by borrow verifier `CBTSWUY5…DMM2`;
  positionId `6878142553…057766`, lockHandle `6303898728…007978`, threshold 1e15) tx
  `77239a68fbe65277b21b0d032cc486f1ec9bfdee4f7b0ce4585f4aaf8ce7ba70` → **REAL 1.1377326 USDC
  disbursed** vault→veil-spike (spike USDC `0.6030172 → 1.7407498`; live ETH price sized it slightly
  above 6d's 1.134). Position ACTIVE, `debt_of` 11377327. Amount (2e15) stays hidden; only the 1e15
  floor is disclosed.

**Negatives (both proven live):**
- **cross-chain injection gate** — `attest_lock` from a non-relayer source (`buyer`) is rejected: the
  contract requires the bound relayer (veil-spike) `require_auth`, which `buyer` cannot forge. Only the
  bound relayer can mirror an Ethereum lock into the pool.
- **borrow binding** — the same borrow proof with a tampered `threshold` (1e15+1, an unproven floor)
  → the vault's verify call returns `Error(Contract, #0)` = InvalidProof → VM trap → **0 USDC moved**
  (simulation failed, never submitted). The proof binds the exact floor.

The ETH never left Ethereum; only `(commitment, amount)` (relayer) + the shielded borrow proof
(Stellar) crossed over. Every ZK proof was generated client-side and verified on-chain.

## Veil v3 — Phase 7-real (Axelar-attested, REAL WETH) — trust-minimized redo
Resolves the review of the first Phase 7: **real** wrapped Sepolia ETH (canonical WETH, no mock/mint)
and the cross-chain attestation is carried by **Axelar GMP** (decentralized validator set, authenticated
on-chain via the Axelar gateway's `validate_message`) — NO trusted relayer, NO state-root poster, NO
native MPT verifier. The trusted-relayer `attest_lock` is replaced by an Axelar `execute`. The shielded
borrow (client-side ZK, verified natively on Soroban) is unchanged.

### Ethereum (Sepolia) — deployer `0xe9179cEf…`
- **canonical WETH** (Uniswap, real wrapped ETH — `deposit()` wraps real ETH 1:1, no mint):
  `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- **DepositFromEthVerifier**: `0x60876f67843e0A3b9cfd7875999fdb8f86A22c09` (deploy `0xd52bfd1f…`)
- **VeilEthLock** (real WETH escrow + opening-proof verify + Axelar `callContract`): `0x7d9F4aC835a547cF0AFB3085d7D03e41a88ccD65`
  (deploy `0x2e5432b2…`; `weth()`=canonical WETH, `gateway()`=Axelar, `destinationContract`=pool below;
  `setDestination` tx `0x216ccd38…`)
- Axelar (Sepolia): gateway `0xe432150cce91c13a887f7D836923d5597adD8E31`, gas service
  `0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6`, chain name `ethereum-sepolia`

### Soroban (testnet) — admin `veil-spike` `GABHHKTQ…FXIF`
- **veil-pool** (Axelar `execute` cross-chain deposit; no trusted relayer, deposit()/token escrow
  compiled OUT — M-02): `CDF7WIYFUHGFGLRQGDXFKFFDHWAGTGWI2LRBMIHTW4KSX2CTGU5RRH7E`
  - constructor pins Axelar gateway `CCSNWHMQ…DT5I` + source_chain `ethereum-sepolia`; P27 verifiers
    lock `CD4LXCNP…` / unlock `CDIAVRLO…` / seize `CCS6HBA3…`
  - `set_vault(veil-vault)` tx `c85857d8…`; `set_eth_lock(<checksummed VeilEthLock>)` = pinned after
    observing the first delivered message (fail-closed until then)
- **veil-vault**: `CAZHJR7XHL62LD465FWK6UGKCD5AGYSHGFQJ3EXPXXKFXUPBGERVMK23`
  - borrow_verifier `CBTSWUY5…DMM2`, veil_pool above, usdc `CBIELTK6…DAMA`, reflector `CCYOZJCO…RN63`
    Other(ETH), ltv 7000 / liq 8000 / min_threshold 1e11 / term 500000 / rate 500
  - `lp_deposit` 1.7 USDC (17000000) tx `a9dfc363…` → total_assets 17000000
- Axelar Stellar gateway: `CCSNWHMQSPTW4PS7L32OIMH7Z6NFNCKYZKNFSWRSYX7MK64KHBDZDT5I`; dest chain
  `stellar-2025-q1`. Axelar delivers EVM `source_address` in EIP-55 checksummed form.

### Live e2e (in progress — Axelar relaying)
- **real WETH lock** (0.002 real ETH wrapped → 2e15 WETH escrowed; opening proof verified on-chain;
  Axelar `ContractCall` + 0.01 ETH gas): tx `0xf68a6171d74996031bb0fd47e7fdefe2634ecce06321c547eba3a384e6f3bf24`
  (block 11187841), payload `(C_available, 2e15)` → pool. Awaiting Axelar confirm→approve→`execute`
  (testnet Amplifier confirmation is slow); then `set_eth_lock` + client lock+borrow → REAL USDC.
- **Confirmed ready (on-chain):** pool `total_deposited` 0 (fresh, awaiting the note), vault
  `total_assets` 17000000, VeilEthLock `isLocked(C)`=true / `totalLocked` 2e15. **Live negative:** a
  direct forged `execute` (fake message_id / `source_address` 0xEVIL) traps (`Error(Storage,
  MissingValue)` — the gateway holds no such approved message) → no note minted. Only an
  Axelar-authenticated message from the pinned VeilEthLock can insert a note.
- **Security-auditor** (agentId a2b498694a86018b6) on the Axelar surface: **NO CRITICAL/HIGH**.
  `validate_message` binds the destination (approval hash includes `caller`=pool) + replay (flips to
  Executed); the `source_chain`/`source_address` asserts are the security-critical gate and are
  present; the opening proof is necessary + kept; payload decode + i128 guard safe; double-mint
  impossible; CEI clean; `execute` fail-closed until `set_eth_lock`. H-01 = operational (verify the
  pinned `EthLockAddr` byte-equals Axelar's EIP-55 form of `0x7d9F4aC8…` — done at pin time via
  `is_message_approved`). Trust = Axelar validator set (inherent/documented) + single-party ceremony
  (testnet-only). Axelar's legacy JS recovery SDK cannot relay this leg ("cannot find chain
  stellar-2025-q1" — Amplifier route); delivery is by Axelar's own relayers.

### ⚠️ CONFIG CORRECTION — stale Axelar chain name (the above deploy was UNDELIVERABLE)
Re-checking the stuck message showed `is_invalid_destination_chain: true`: the gmp-example README's
`stellar-2025-q1` is STALE. The current Stellar testnet Amplifier chain (Axelar `getChains`, 2026-07)
is **`stellar-2026-q1-2`**, gateway **`CB2JYOOZPHO43R57TC5PXV22QICKIDC5NKRF62BZG2J6JYFUIQPIAYY3`**
(was `CCSNWHMQ…`). Sepolia source (`ethereum-sepolia`, gateway `0xe432150c…`) was already correct.
VeilEthLock's destination chain is now SETTABLE (survives quarterly Amplifier rotations). **Corrected
redeploy (THIS is the live set; the addresses above are superseded):**
- Sepolia: DepositFromEthVerifier `0xfe346c22f793032a1f5d3ba18d940fe27e9fc19f`, **VeilEthLock
  `0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2`** (`setDestination("stellar-2026-q1-2", pool)`)
- Soroban: **veil-pool `CDIHDUDQIODLZOJAOCZA7DFIHYSX4C37N42RRFWQRC6NN6P7V6263WTB`** (Axelar gateway
  `CB2JYOOZ…` + `ethereum-sepolia` pinned), **veil-vault
  `CCXGKWB5BQFPIJFARYYIB4FBQPLHGFBVANWHFODMQDRHPF2E3K6DCNKF`** (LP 1.7 USDC), `set_vault` tx `467d73dc…`
- **re-lock**: 0.002 REAL WETH escrowed on the new VeilEthLock (tx
  `0x6903206311608c7d73396c533bab95da1a35f8692f140db9f1105d562d84d7f9`, isLocked=true) → Axelar message
  to `stellar-2026-q1-2` + pool, **`is_invalid_destination_chain: false`, gas_paid: true** (now VALID +
  routing). Superseded (stale-chain) set: pool `CDF7WIYF…`, vault `CAZHJR7X…`, VeilEthLock `0x7d9F4a…`.

### ✅ LIVE e2e COMPLETE — trust-minimized cross-chain, REAL WETH → REAL USDC (no trusted relayer)
Axelar delivered the message end-to-end (confirm→approve; approve tx on Stellar `e7f363ea…`, message_id
`0x6903…d7f9-3`, source_address `0xE114C79D…` checksummed). Then, all client-side:
- **`set_eth_lock`** (pinned the checksummed VeilEthLock, verified against the gateway's on-chain
  approved sourceAddress) tx `301e2e6c…`
- **`execute`** (Axelar `validate_message` authenticated the message on-chain → note inserted) tx
  `53737b44d385bcb77777c8d0bd18018dfebeec1e65b36a75b7d49a407500ffc9` — `AttestLock` leaf 0, commitment
  `7530136…834832`, amount 2e15; `total_deposited` = 2e15. (First `execute` with the wrong message_id
  format → `validate_message`→false→trap, 0 state — the authentication is exact.)
- **client lock proof** → `veil-pool.lock` tx `d83536db…` — nullifier burned, LOCKED note leaf 1, root R1
- **client borrow proof** → `veil-vault.borrow` tx
  `61dafbc30c168b3254f32c864e55a37569c3d60762df0c2170ca8e0e8d51912b` → **REAL 1.1887167 USDC** disbursed
  vault→spike (balance `0.0407498 → 1.2294665`)
- **negative (ZK load-bearing):** same borrow proof + tampered `threshold` 1e15+1 → `Error(Contract,#0)`
  InvalidProof, **0 USDC moved**.

**Both original critiques resolved live:** collateral is REAL wrapped Sepolia ETH (no mock/mint); the
cross-chain attestation is authenticated on-chain via **Axelar's decentralized validator set** (no
trusted relayer, no state-root poster). ETH stays on Ethereum; only the authenticated `(C, amount)` +
the shielded borrow proof cross over.

## Reverse-leg verifiers (2026-07-03)

Two new Groth16 verifier contracts for the repayment/release path (B1′ lock VK + release_repaid circuit).
Both deployed via `veil-spike` on Stellar testnet.

| Label | Contract ID | WASM sha256 |
|---|---|---|
| `LOCK_V2_VERIFIER` | `CA4XWFDN4BDKRDVJ43IQLFQ6IGMU477OAEQXBYFCX2NQ7JWVJHE5A4TE` | `294de062dd2d4ecb5bc6a7cdd1e2684653f943ba225d577a2871d34363796f4c` |
| `RELEASE_VERIFIER` | `CDH7TOPQL2X3UW6SQNGRSOAOKLRI2QNQU6A3VDHJR2JQDNWMCSS2GLCB` | `1aabd468e8b397fae3427aa547a177e20a4cd6a2b877c992ed11e5f302b1acca` |

- lock_v2 deploy tx: `a35772057ca99e30c39e71bfc32d1b1e855a78a9754e2114beec2043e2318bca`
- release deploy tx (upload): `0842bbbb319e09d55b0720743ec17e87323d3389db38304c6e86f51f4a8c011c`
- release deploy tx (instantiate): `82b4ca30e5fa4441613662819815bb3dbddcae13e49539d3badd4daae5a82c5d`
- VKs: `circom/keys/lock.vk.json` (B1′) and `circom/keys/release_repaid.vk.json`
- All 7 cargo roundtrip tests pass (incl. new `release_repaid_proof_verifies_on_soroban`)

---

## Veil v3 — Reverse-leg redeploy (repay-release, 2026-07-03) — admin `veil-spike`

Fresh pool + 4 verifiers for the reverse leg (B1′ lock binding + `release_repaid`). The LIVE Phase-7
pool/verifiers/VeilEthLock are LEFT UNTOUCHED as the proven forward-leg artifact; the reverse e2e
re-locks on this new pool (fresh e2e, per U10).

**Groth16 verifiers (Soroban testnet):**
- `LOCK_V2_VERIFIER` (B1′ lock circuit): `CA4XWFDN4BDKRDVJ43IQLFQ6IGMU477OAEQXBYFCX2NQ7JWVJHE5A4TE` (wasm 294de062…)
- `RELEASE_VERIFIER` (release_repaid): `CDH7TOPQL2X3UW6SQNGRSOAOKLRI2QNQU6A3VDHJR2JQDNWMCSS2GLCB` (wasm 1aabd468…)
- `UNLOCK_VERIFIER` (fresh, from committed unlock.vk.json): `CBXNZD5EYROICZQYZ7KOJUVR6M4XWIWMBSJAFSTUUSWZIH4JHLJSEZ4U` (wasm a2fd9cbb…)
- `SEIZE_VERIFIER` (fresh, from committed seize.vk.json): `CBLRFQ6S43S4QZCGWT2NVFVAGL6OKCDKEL353JKKEB2MHUPTMJRPWES4` (wasm c73bb85b…)

**veil-pool v2 (reverse leg):** `CA67KKXWF2HMI5YYOVSISB242QDYS5TTPAQBVJBNYTRCYROA3ETKMWUB` (wasm a41f6af3…, 49398 bytes)
- constructor: admin `veil-spike`, token USDC_SAC `CBIELTK6…DAMA` (inert — cross-chain collateral is
  Ethereum WETH), levels 16, lock/unlock/seize/release verifiers above, axelar_gateway
  `CB2JYOOZ…IQPIAYY3`, source_chain `ethereum-sepolia` (Axelar's Sepolia id; also the OUTBOUND dest).
- `set_vault(CCXGKWB5…CNKF)` (reuses the existing funded vault) tx `96c9416777c42521b08b872ddf657b5f7cf19432cff041dc6c5909b2f98247b3`
- `set_eth_lock` = DEFERRED to Task 8 (after VeilEthLock v2 deploy — it is the pinned outbound dest).
- `set_axelar_outbound` = SKIPPED (v1): pay_gas is optional; the reverse hop is emitted by
  `call_contract` and executed via Axelarscan manual add-gas (spec §5.4). Gas prepayment can be
  wired later via `set_axelar_outbound` once the Stellar gas service + auth are calibrated.

Stellar Amplifier chain name (for VeilEthLock v2 trusted source, Task 8): `stellar-2026-q1-2` (re-verify).
Axelar gas token (if wiring pay_gas later): native XLM SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.

## VeilEthLock v2 (Sepolia, reverse leg) — 2026-07-03, deployer `0xe9179cEf…`

- **VeilEthLockV2:** `0x2C4A669AD2f5Aeb1Ab91681022D1924DBED6f4AC` (deploy tx `0x88d801b295afec5b667ff9f07b04e1c2827343d3717b5fab450077fc4ecd5312`)
  - constructor: WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, verifier (reused v1 DepositFromEthVerifier)
    `0xfe346c22f793032a1f5d3ba18d940fe27e9fc19f`, gateway `0xe432150cce91c13a887f7D836923d5597adD8E31`,
    gasService `0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6`.
  - `setTrustedSource("stellar-2026-q1-2", "CA67KKXW…MWUB")` (reverse execute pin) tx `0xa28509d6a7f4be05289538bcae7e1c5cd1a0eb2cbd3ce703b596e0b1fee02191`
  - `setDestination("stellar-2026-q1-2", "CA67KKXW…MWUB")` (forward lock attest dest) tx `0x32fa1da8a2f499fbdc5feb2cee8de43eea39d95b6a31ffcbe1d5d6887cba0742`
- **Stellar side:** `veil-pool.set_eth_lock("0x2C4A669AD2f5Aeb1Ab91681022D1924DBED6f4AC")` tx `e06b41d6bfcea4dfbcb44aed69cd6ccee64dfa0a91569cacd7293b8609f5620f`
- Gas: pay_gas SKIPPED (optional); reverse hop executed via Axelarscan manual add-gas. WETH funding for
  the fresh lock deferred to the Task 15 e2e (wrap ETH→WETH; deployer holds ~2.05 ETH, 0 WETH).
- ⚠️ §5.3 format-verify at e2e: forward source_address (Axelar delivers EIP-55 checksummed EVM — matches
  v1 pattern) and reverse trustedSourceAddress (Stellar strkey form) — both are one-time pins; if a form
  mismatch surfaces in Task 15, redeploy the affected side.

## Frontend (reverse-leg) — production deploy 2026-07-03
- **Live:** https://veilzk.vercel.app (deployment `web-k6nly35tk-damilolas-projects-fafdf859.vercel.app`)
- Serves the reverse-leg build (RepayFlow + v2 addresses confirmed in bundle: pool CA67KKXW…, VeilEthLockV2
  0x2C4A669A…, LOCK_V2 CA4XWFDN…, RELEASE CDH7TOPQ…). `.env.local` guarded/intact through deploy.

## ⚠️ MATCHED REDEPLOY (2026-07-03) — fixes vault-reuse showstopper
Deep review found: `vault.borrow` cross-calls `veil_pool.is_known_root(root)` and `veil_pool` is
constructor-only. The reused vault CCXGKWB5 was bound to the OLD pool, so borrowing against the new
pool's root would revert `UnknownRoot` → forward leg broken. Since the pool's one-time `set_vault` was
already consumed, the fix is a matched fresh triple (no code changes):
- **veil-pool P2:** `CA7H5WQISBIWVEWXRBTGHSB3UMEFK7RR4QJHYGAMZVEV7NSW3MFJLHLN` (same verifiers/gateway/source_chain)
- **veil-vault V2:** `CAXOQQ7V4ZDI5TO5SJQQLGXHMWATL3VXXG5YBZJ33SCR7IJ3C7JRYBPT` (veil_pool=P2; ltv 7000/liq 8000/min_threshold 1e11/term 500000/rate 500; borrow_verifier CBTSWUY5; usdc CBIELTK6; reflector CCYOZJCO Other(ETH); LP 2 USDC funded)
- **VeilEthLock E3 (Sepolia):** `0x06bB519A490030DE251EeB83818F875Cc87002e0` (deploy tx `0xb9976de3d645273aea6e9e3616ec4b7e1b6f91a2ac4e5a724fc1d95f5ae5d982`)
- Wiring: P2.set_vault(V2); P2.set_eth_lock(E3); E3.setTrustedSource+setDestination(stellar-2026-q1-2, P2).
- Web onchain.ts repointed → P2/V2/E3; frontend redeployed to veilzk.vercel.app.
- SUPERSEDES the earlier CA67KKXW / CCXGKWB5 / 0x2C4A669A set (those are abandoned; CA67KKXW's set_vault
  is mis-bound and unusable).

## ⚠️ REPAY-FIX MATCHED REDEPLOY (2026-07-03, P3/V3/E4) — admin `veil-spike`
Fixes the repay/release reverse leg: `veil-vault.repay` now takes a caller-fixed `max_repay` (pull +
vault-self-auth refund of the accrued-interest excess), so the borrower→vault transfer auth stays valid
across the Freighter sign delay (was `sceAuth`). Because `set_vault`/`set_eth_lock` are one-time and the
vault's `veil_pool` is constructor-immutable, this needs a fresh matched triple. veil-pool also gained two
read-only getters (`vault_addr`, `eth_lock_addr`) for the invariant check. **P2/V2/E3 left LIVE untouched
as rollback until the live e2e proves green.**
- **veil-pool P3:** `CBDCEWCXXM6QFGKWA466RF2I5LNY5N2CKMVKLCBIQUXOK5IK5W5INJAQ` (deploy tx `a75b0bb7be1e9a8807082d5318da7dd59d57f7e6bbaff09a7b9fe7e7debaedc6`)
  - constructor: admin veil-spike, token USDC_SAC `CBIELTK6…DAMA`, levels 16, lock `CA4XWFDN…`, unlock
    `CBXNZD5E…`, seize `CBLRFQ6S…`, axelar_gateway `CB2JYOOZ…IQPIAYY3`, source_chain `ethereum-sepolia`,
    release `CDH7TOPQ…` (SAME verifiers/gateway/source_chain as P2).
  - `set_vault(V3)` tx `56ce09a869bd293b0064070101ce394997aaa702ecc8e4e1ca645d76154bab9f`
  - `set_eth_lock(0x81078A116b93Da170BB4f7B6282F7a26566e8933)` tx `4f68705781ad37867ec71b1452bdd6c1c59e3032c8f25b046db29ab5b643cc45`
- **veil-vault V3:** `CB7PH2V266O5GKLPP7CC5VE2LC5RLN5KXHTN6ETR2Y5JWIJIA3XP2TT2` (deploy tx `8723724ae7f5bf7d5fb9fa5d03bea165aab844bcdd4d8efc4b955ba6cd0b4bfd`)
  - constructor: admin veil-spike, borrow_verifier `CBTSWUY5…`, veil_pool=P3, usdc `CBIELTK6…`, reflector
    `CCYOZJCO…` Other(ETH), ltv 7000 / liq 8000 / min_threshold 100000000000 / term 500000 / rate 500
    (byte-identical to V2 except veil_pool=P3).
  - LP: `lp_deposit` 4 USDC (40000000) from veil-lp tx `9b90d968cddf9b051a97af6769e4bc5d904b54e03dc4cfd232aec0a9be1cf506`. **NEEDS TOP-UP to ~14 USDC before the e2e borrow (~6 USDC).**
- **VeilEthLock E4 (Sepolia):** `0x81078A116b93Da170BB4f7B6282F7a26566e8933` (deploy via DeployEthLock.s.sol; fresh DepositFromEthVerifier `0xaB182da1CAfaB22a75a47Ec2770Df626f4AD8e4E`; WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, gateway `0xe432150cce91c13a887f7D836923d5597adD8E31`, gasService `0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6`)
  - `setDestination("stellar-2026-q1-2", P3)` tx `0x3e69f176bb6973251c00c472c8edca04064a61ea39c143ca0462033c0211b841`
- **Invariant check:** `pnpm verify:triple` → 4/4 pins PASS (V3.veil_pool==P3, P3.vault_addr==V3, P3.eth_lock_addr==E4, E4.destinationContract==P3 + destinationChain stellar-2026-q1-2).
- Web onchain.ts/constants.ts repoint → P3/V3/E4 + Vercel redeploy pending; **alias veilzk.vercel.app HELD on P2/V2/E3 until the live lock→borrow→repay→release e2e passes.**
