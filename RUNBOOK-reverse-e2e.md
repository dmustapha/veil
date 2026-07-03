# Veil v3 — Live Reverse-Leg E2E Runbook (hands-on)

The full forward→reverse round-trip on the **v2 stack**, driven hands-on in the deployed app.
Everything below is deployed, wired, and verified on-chain; this proves the round trip live.

**App:** https://veilzk.vercel.app

## Live addresses (v2)
- veil-pool: `CA67KKXWF2HMI5YYOVSISB242QDYS5TTPAQBVJBNYTRCYROA3ETKMWUB`
- VeilEthLockV2 (Sepolia): `0x2C4A669AD2f5Aeb1Ab91681022D1924DBED6f4AC`
- veil-vault (reused): `CCXGKWB5BQFPIJFARYYIB4FBQPLHGFBVANWHFODMQDRHPF2E3K6DCNKF`
- Verifiers: LOCK_V2 `CA4XWFDN…A4TE`, RELEASE `CDH7TOPQ…GLCB`

## Wallet setup (both required)
- **Freighter** on **Stellar testnet** — signs the Soroban txs (execute attest, lock-note, borrow, repay, release). Fund with testnet XLM (friendbot).
- **MetaMask** on **Sepolia** — the WETH lock source AND the release recipient. Needs ~**0.01 Sepolia ETH** (the lock flow wraps ETH→WETH automatically). Your WETH releases back to this address.

## Forward leg (create the position)
1. Open the app, unlock the note vault (passphrase).
2. **Open position** → the app: proves the deposit (client-side), wraps ETH→WETH + approves if needed, calls `VeilEthLockV2.lock` (real WETH escrowed, keyed by `C0`).
3. **Axelar hop #1 (ETH→Stellar, ~a few–15 min):** the app polls Axelarscan, then calls `veil-pool.execute` → mints the shielded AVAILABLE note. (Resumable — if you reload, "Continue" resumes the wait.)
4. **Borrow** → client lock proof (B1′, carries `r`) → `veil-pool.lock` (AVAILABLE→LOCKED) → client borrow proof → `veil-vault.borrow` → **real USDC** disbursed to you. Note status = `borrowed`.

## Reverse leg (repay → release WETH) — the new part
5. On the borrowed note card, click **"Repay & release WETH"** (needs both wallets connected):
   - `veil-vault.repay` — returns the USDC debt, appends the repaid leaf → status `repaid`.
   - Builds the release witness (pool path for C1 + repaid path at index 0 + `recipient = keccak(yourEvmAddr) mod r`), **proves `release_repaid` in the browser**.
   - `veil-pool.release_repaid` — verifies the proof on-chain (RELEASE verifier), spends the nullifier, **emits the Axelar message** to VeilEthLockV2. Records `releaseTx`.
6. **Axelar hop #2 (Stellar→ETH, ~a few–15 min):** the app polls for approval.
   - ⚠️ **Gas note:** `pay_gas` is intentionally not prepaid on the Soroban side (v1). So on the **first** run the message will be *approved* but may need a **manual execute**:
     - Open **https://testnet.axelarscan.io** → paste the `release_repaid` Stellar tx hash (or search the pool address) → find the GMP message.
     - Click **"Add Gas"** (pay a little Sepolia ETH) → then **"Execute"** (or it auto-executes once gas is present).
   - This calls `VeilEthLockV2.execute` → transfers the **full escrowed WETH** to your MetaMask address → emits `Released`.
7. The app polls `isReleased(C0)` and flips the note to **`released`** once confirmed. Your MetaMask WETH balance increases by the locked amount.

## Negative check (double-release blocked)
- Re-submitting the same `release_repaid` → pool rejects `"nullifier already spent"`.
- Re-delivering the same Axelar payload → `VeilEthLockV2.execute` reverts `AlreadyReleased`.

## What's proven without this run (already green)
- Both ZK provers verify **live on-chain** (lock vs LOCK_V2, release vs RELEASE) + tamper-rejected.
- The **insolvency attack** (release an active loan's collateral via a repaid same-amount note) **fails at witness generation** — the B1′ solvency binding.
- Full suites green: web 103/103, forge 68/68, veil-pool 39/39, veil-verifier 7/7.

## If something stalls
- Axelar hop slow → it's resumable; reopen the note and it continues polling (20-min window, 15-s poll).
- Release marked `repaid` but not `released` → the reverse hop is still in flight or needs the manual Axelarscan execute (step 6). The release is already submitted; re-running only re-polls (it will NOT double-spend).
