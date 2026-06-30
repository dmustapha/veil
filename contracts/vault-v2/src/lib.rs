//! # Veil Vault v2 — private margin lending
//!
//! A borrower presents a RISC Zero proof (the v2 borrow guest) that a **LOCKED shielded note**
//! in `VeilPool` clears a threshold floor `T` — with the exact collateral amount, the note, and
//! its owner kept private. `borrow` verifies the proof and lends Circle USDC from an **ERC-4626
//! liquidity pool** against `T`, accruing interest via a global `borrow_index`. The hidden amount
//! is what makes this private margin lending: no one sees the borrower's buffer or liquidation point.
//!
//! v2 vs v1: the public-hashlock/escrow-slot model is replaced by a shielded note pool. The journal
//! is `{root, T, position_id, lockHandle, borrower}` (144 bytes). Disclosed trust (this build): the
//! relayer that posts Ethereum pool roots (`add_root`), the Reflector oracle, and the loan term.
//!
//! Cross-chain unlock/liquidation (Relayer B + unlock guest + recovery key) are later build items;
//! `repay` here settles principal+interest and marks the position REPAID.
#![no_std]

mod journal;
#[cfg(test)]
mod test;
mod tree;

use journal::Journal;
use tree::RepaidTree;
use risc0_interface::RiscZeroVerifierClient;
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Symbol,
};

const DAY_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_LEDGERS;
const BUMP_THRESHOLD: u32 = BUMP_AMOUNT - DAY_LEDGERS;
const MAX_PRICE_AGE_SECS: u64 = 1_800;

/// Fixed-point scale for the interest index (1.0 == 1e9).
const INDEX_SCALE: i128 = 1_000_000_000;
/// Ledgers per year (≈365 d × 17_280 ledgers/d), the interest-accrual denominator.
const LEDGERS_PER_YEAR: i128 = 365 * DAY_LEDGERS as i128;

/// Position lifecycle.
const STATUS_ACTIVE: u32 = 0;
const STATUS_REPAID: u32 = 1;
const STATUS_LIQUIDATED: u32 = 2;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    UnknownRoot = 3,
    ThresholdTooLow = 4,
    LockHandleUsed = 5,
    PositionExists = 6,
    NoPosition = 7,
    AlreadyClosed = 8,
    WrongBorrower = 9,
    NoPrice = 10,
    StalePrice = 11,
    LoanTooSmall = 12,
    InsufficientLiquidity = 13,
    ZeroAmount = 14,
    InsufficientShares = 15,
    LockMismatch = 16,
    FloorNotRaised = 17,
    NotLiquidatable = 18,
}

// ---- Reflector (SEP-40) minimal interface ----
#[contracttype]
#[derive(Clone)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "ReflectorClient")]
pub trait Reflector {
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;
    fn decimals(env: Env) -> u32;
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub verifier: Address,
    pub image_id: BytesN<32>,
    pub usdc: Address,
    pub reflector: Address,
    pub reflector_asset: Asset,
    pub ltv_bps: u32,
    /// Liquidation threshold (bps). A position is liquidatable once `floor·price·liq_bps < debt`.
    /// Set above `ltv_bps` so a freshly-opened loan has headroom before it can be liquidated.
    pub liq_bps: u32,
    pub min_threshold: u128,
    pub term_ledgers: u32,
    /// Annual borrow interest rate in basis points (e.g. 500 = 5%/yr).
    pub rate_bps: u32,
}

/// Global ERC-4626 LP pool + interest accumulator.
#[contracttype]
#[derive(Clone)]
pub struct Pool {
    pub total_shares: i128,
    pub total_idle: i128,            // USDC available to lend
    pub total_borrowed_scaled: i128, // Σ position.principal_scaled
    pub borrow_index: i128,          // grows with accrued interest; starts INDEX_SCALE
    pub last_accrual: u32,           // ledger seq of the last accrual
}

#[contracttype]
#[derive(Clone)]
pub struct Position {
    pub position_id: BytesN<32>,
    pub lock_handle: BytesN<32>,
    pub borrower: Address,
    pub principal: i128,        // original USDC principal (display/reference)
    pub principal_scaled: i128, // principal × SCALE / index_at_open; debt = scaled × index / SCALE
    pub floor: u128,            // T (wstETH-units); raised by the margin re-proof (later item)
    pub root: BytesN<32>,
    pub due_ledger: u32,
    pub status: u32,
}

#[contracttype]
enum DataKey {
    Config,
    Pool,
    Root(BytesN<32>),       // known Ethereum pool root (relayed)
    Position(BytesN<32>),   // position_id -> Position
    LockUsed(BytesN<32>),   // lockHandle -> true (PERMANENT; never deleted)
    Shares(Address),        // LP share balance
    RepaidTree,             // Soroban repaid-position tree (R_sor)
    LiquidatedTree,         // Soroban liquidated-position tree (R_liq)
}

#[contract]
pub struct VeilVault;

#[contractimpl]
impl VeilVault {
    /// One-time configuration. `admin` controls root posting.
    #[allow(clippy::too_many_arguments)]
    pub fn init(
        env: Env,
        admin: Address,
        verifier: Address,
        image_id: BytesN<32>,
        usdc: Address,
        reflector: Address,
        reflector_asset: Asset,
        ltv_bps: u32,
        liq_bps: u32,
        min_threshold: u128,
        term_ledgers: u32,
        rate_bps: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        let cfg = Config {
            admin, verifier, image_id, usdc, reflector, reflector_asset,
            ltv_bps, liq_bps, min_threshold, term_ledgers, rate_bps,
        };
        env.storage().instance().set(&DataKey::Config, &cfg);
        let pool = Pool {
            total_shares: 0,
            total_idle: 0,
            total_borrowed_scaled: 0,
            borrow_index: INDEX_SCALE,
            last_accrual: env.ledger().sequence(),
        };
        env.storage().instance().set(&DataKey::Pool, &pool);
        // Empty repaid-tree (R_sor); a leaf is appended on each repay.
        env.storage().instance().set(&DataKey::RepaidTree, &tree::empty(&env));
        // Empty liquidated-tree (R_liq); a leaf is appended on each liquidation.
        env.storage().instance().set(&DataKey::LiquidatedTree, &tree::empty(&env));
        Ok(())
    }

    /// Post a known Ethereum VeilPool root. DISCLOSED TRUST: a Wormhole/ZK relayer replaces this
    /// (build item 5). Admin-gated.
    pub fn add_root(env: Env, root: BytesN<32>) -> Result<(), Error> {
        let cfg = Self::cfg(&env)?;
        cfg.admin.require_auth();
        let key = DataKey::Root(root);
        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Supply USDC to the LP pool; receive ERC-4626 shares. Yield accrues as borrowers pay interest.
    pub fn lp_deposit(env: Env, from: Address, assets: i128) -> Result<i128, Error> {
        from.require_auth();
        if assets <= 0 {
            return Err(Error::ZeroAmount);
        }
        let cfg = Self::cfg(&env)?;
        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);

        let total_assets = Self::assets_of(&pool);
        let shares = if pool.total_shares == 0 || total_assets == 0 {
            assets
        } else {
            assets.checked_mul(pool.total_shares).expect("ovf").checked_div(total_assets).unwrap()
        };
        // Reject a deposit that rounds to zero shares (ERC-4626 inflation / round-to-zero guard):
        // otherwise a depositor could lose assets for no shares.
        if shares <= 0 {
            return Err(Error::ZeroAmount);
        }

        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&from, &env.current_contract_address(), &assets);

        pool.total_idle += assets;
        pool.total_shares += shares;
        Self::add_shares(&env, &from, shares);
        Self::save_pool(&env, &pool);
        Ok(shares)
    }

    /// Redeem ERC-4626 shares for USDC (only from idle liquidity).
    pub fn lp_withdraw(env: Env, to: Address, shares: i128) -> Result<i128, Error> {
        to.require_auth();
        if shares <= 0 {
            return Err(Error::ZeroAmount);
        }
        let held = Self::share_balance(&env, &to);
        if held < shares {
            return Err(Error::InsufficientShares);
        }
        let cfg = Self::cfg(&env)?;
        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);

        let total_assets = Self::assets_of(&pool);
        let assets = shares.checked_mul(total_assets).expect("ovf") / pool.total_shares;
        if assets <= 0 {
            return Err(Error::ZeroAmount);
        }
        if pool.total_idle < assets {
            return Err(Error::InsufficientLiquidity);
        }

        pool.total_idle -= assets;
        pool.total_shares -= shares;
        Self::add_shares(&env, &to, -shares);
        Self::save_pool(&env, &pool);

        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&env.current_contract_address(), &to, &assets);
        Ok(assets)
    }

    /// Atomic verify-and-lend. The proof gates real USDC. Returns the principal disbursed.
    pub fn borrow(
        env: Env,
        seal: Bytes,
        journal_bytes: Bytes,
        borrower: Address,
    ) -> Result<i128, Error> {
        borrower.require_auth();
        let cfg = Self::cfg(&env)?;

        // 1. Verify the RISC Zero proof. Traps the whole call on an invalid proof.
        let digest = env.crypto().sha256(&journal_bytes);
        RiscZeroVerifierClient::new(&env, &cfg.verifier)
            .verify(&seal, &cfg.image_id, &digest.into());

        // 2. Trust the journal now that its sha256 matches the verified digest.
        let j: Journal = journal::decode(&env, &journal_bytes);

        // 3. The membership root must be a known (relayed) Ethereum pool root.
        if !env.storage().persistent().has(&DataKey::Root(j.root.clone())) {
            return Err(Error::UnknownRoot);
        }
        // 3a. Anti-replay: the proof is bound to ONE Stellar account. A stolen {seal, journal}
        //     cannot be redeemed by a different caller. (journal.borrower == keccak256(strkey).)
        let strkey = borrower.to_string().to_bytes();
        let expected_borrower = env.crypto().keccak256(&strkey).to_bytes();
        if j.borrower != expected_borrower {
            return Err(Error::WrongBorrower);
        }
        // 3b. One lock -> one loan, FOREVER. The tree is append-only, so a spent note stays
        //     provable against old roots; the lockHandle consumed-set must be permanent.
        if env.storage().persistent().has(&DataKey::LockUsed(j.lock_handle.clone())) {
            return Err(Error::LockHandleUsed);
        }
        // 3c. Reject a duplicate position id.
        if env.storage().persistent().has(&DataKey::Position(j.position_id.clone())) {
            return Err(Error::PositionExists);
        }
        if j.threshold < cfg.min_threshold {
            return Err(Error::ThresholdTooLow);
        }

        // 4. Size the loan from the live Reflector price (reject a stale price).
        let r = ReflectorClient::new(&env, &cfg.reflector);
        let px = r.lastprice(&cfg.reflector_asset).ok_or(Error::NoPrice)?;
        if env.ledger().timestamp().saturating_sub(px.timestamp) > MAX_PRICE_AGE_SECS {
            return Err(Error::StalePrice);
        }
        let principal = journal::size_loan(j.threshold, px.price, r.decimals(), cfg.ltv_bps);
        if principal <= 0 {
            return Err(Error::LoanTooSmall);
        }

        // 5. Draw from idle LP liquidity (accrue first so the index is current).
        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        if pool.total_idle < principal {
            return Err(Error::InsufficientLiquidity);
        }
        let principal_scaled = principal.checked_mul(INDEX_SCALE).expect("ovf") / pool.borrow_index;

        // 6. Record position + lock + pool deltas BEFORE the transfer (checks-effects-interactions).
        let due = env.ledger().sequence() + cfg.term_ledgers;
        let pos = Position {
            position_id: j.position_id.clone(),
            lock_handle: j.lock_handle.clone(),
            borrower: borrower.clone(),
            principal,
            principal_scaled,
            floor: j.threshold,
            root: j.root.clone(),
            due_ledger: due,
            status: STATUS_ACTIVE,
        };
        pool.total_idle -= principal;
        pool.total_borrowed_scaled += principal_scaled;

        let pk = DataKey::Position(j.position_id.clone());
        env.storage().persistent().set(&pk, &pos);
        env.storage().persistent().set(&DataKey::LockUsed(j.lock_handle.clone()), &true);
        Self::save_pool(&env, &pool);

        // 7. Disburse real USDC from the vault to the borrower (interaction last).
        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&env.current_contract_address(), &borrower, &principal);
        Self::bump(&env, &pk);
        Self::bump(&env, &DataKey::LockUsed(j.lock_handle));
        Ok(principal)
    }

    /// Private margin call. Under price stress the borrower re-proves that the SAME locked note
    /// clears a HIGHER floor `T'` (a borrow-shaped receipt with a larger threshold) and raises
    /// `Position.floor` to `T'` — defending the position by revealing a tighter lower bound, never
    /// the exact amount. Soroban-only: no Ethereum tx, no new disbursement, no re-lock. The raised
    /// floor strengthens the liquidation health predicate (build item 8). Returns the new floor.
    pub fn margin(
        env: Env,
        seal: Bytes,
        journal_bytes: Bytes,
        borrower: Address,
    ) -> Result<u128, Error> {
        borrower.require_auth();
        let cfg = Self::cfg(&env)?;

        // 1. Verify the RISC Zero proof (same guest/image_id as borrow; T is just larger).
        let digest = env.crypto().sha256(&journal_bytes);
        RiscZeroVerifierClient::new(&env, &cfg.verifier)
            .verify(&seal, &cfg.image_id, &digest.into());
        let j: Journal = journal::decode(&env, &journal_bytes);

        // 2. Membership root must be a known (relayed) Ethereum pool root.
        if !env.storage().persistent().has(&DataKey::Root(j.root.clone())) {
            return Err(Error::UnknownRoot);
        }
        // 3. Anti-replay: the proof is bound to ONE Stellar account.
        let strkey = borrower.to_string().to_bytes();
        if j.borrower != env.crypto().keccak256(&strkey).to_bytes() {
            return Err(Error::WrongBorrower);
        }

        // 4. The position must exist, be active, and belong to the caller.
        let pk = DataKey::Position(j.position_id.clone());
        let mut pos: Position = env.storage().persistent().get(&pk).ok_or(Error::NoPosition)?;
        if pos.status != STATUS_ACTIVE {
            return Err(Error::AlreadyClosed);
        }
        if pos.borrower != borrower {
            return Err(Error::WrongBorrower);
        }
        // 5. Must re-prove the SAME locked note (margin can't swap collateral).
        if j.lock_handle != pos.lock_handle {
            return Err(Error::LockMismatch);
        }
        // 6. A margin call only ever TIGHTENS the floor (strictly raises the proven lower bound).
        if j.threshold <= pos.floor {
            return Err(Error::FloorNotRaised);
        }

        pos.floor = j.threshold;
        env.storage().persistent().set(&pk, &pos);
        Self::bump(&env, &pk);
        Ok(j.threshold)
    }

    /// Repay principal + accrued interest; mark the position REPAID. Returns the amount repaid.
    /// (Cross-chain collateral unlock is a later build item.)
    pub fn repay(env: Env, position_id: BytesN<32>) -> Result<i128, Error> {
        let cfg = Self::cfg(&env)?;
        let pk = DataKey::Position(position_id.clone());
        let mut pos: Position = env.storage().persistent().get(&pk).ok_or(Error::NoPosition)?;
        if pos.status != STATUS_ACTIVE {
            return Err(Error::AlreadyClosed);
        }
        pos.borrower.require_auth();

        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        let debt = pos.principal_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE;

        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&pos.borrower, &env.current_contract_address(), &debt);

        pool.total_idle += debt;
        pool.total_borrowed_scaled -= pos.principal_scaled;
        pos.status = STATUS_REPAID;
        env.storage().persistent().set(&pk, &pos);
        Self::save_pool(&env, &pool);
        Self::bump(&env, &pk);

        // Append repaid_leaf(lockHandle) to the repaid-tree → new R_sor. Relayer B posts this to
        // Ethereum; the unlock guest proves membership against it (the repay-proof that lets the
        // borrower recover their LOCKED collateral — and ONLY after repaying).
        let mut rt: RepaidTree = env.storage().instance().get(&DataKey::RepaidTree).unwrap();
        let leaf = tree::repaid_leaf(&env, &pos.lock_handle);
        tree::insert(&env, &mut rt, leaf);
        env.storage().instance().set(&DataKey::RepaidTree, &rt);
        Ok(debt)
    }

    /// Liquidate a defaulted position. Permissionless: any `liquidator` may call it, but they must
    /// repay the debt to the pool (so the LPs are made whole) — in return they recover the locked
    /// collateral on Ethereum via `VeilPool.seize` (worth ≥ the proven floor, so they profit at the
    /// liquidation threshold). A position is liquidatable iff it is under-collateralized at the
    /// proven floor (`floor·price·liq_bps < debt`) OR its loan term has lapsed. The hidden surplus
    /// (collateral above the floor) is returned to the borrower as a change note by the seize proof.
    /// Marks the position LIQUIDATED and appends `liquidated_leaf(lockHandle)` to `R_liq` — the
    /// default-proof the seize guest folds. Returns the debt absorbed.
    pub fn liquidate(env: Env, position_id: BytesN<32>, liquidator: Address) -> Result<i128, Error> {
        let cfg = Self::cfg(&env)?;
        let pk = DataKey::Position(position_id.clone());
        let mut pos: Position = env.storage().persistent().get(&pk).ok_or(Error::NoPosition)?;
        if pos.status != STATUS_ACTIVE {
            return Err(Error::AlreadyClosed);
        }
        liquidator.require_auth();

        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        let debt = pos.principal_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE;

        if !Self::is_liq(&env, &cfg, &pos, debt) {
            return Err(Error::NotLiquidatable);
        }

        // The liquidator repays the debt; the pool's idle liquidity is restored (LPs whole).
        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&liquidator, &env.current_contract_address(), &debt);

        pool.total_idle += debt;
        pool.total_borrowed_scaled -= pos.principal_scaled;
        pos.status = STATUS_LIQUIDATED;
        env.storage().persistent().set(&pk, &pos);
        Self::save_pool(&env, &pool);
        Self::bump(&env, &pk);

        // Append liquidated_leaf(lockHandle) → new R_liq (Relayer C relays it; the seize guest
        // proves membership against it — collateral can be seized ONLY after this default-proof).
        let mut lt: RepaidTree = env.storage().instance().get(&DataKey::LiquidatedTree).unwrap();
        let leaf = tree::liquidated_leaf(&env, &pos.lock_handle);
        tree::insert(&env, &mut lt, leaf);
        env.storage().instance().set(&DataKey::LiquidatedTree, &lt);
        Ok(debt)
    }

    /// Liquidation predicate: under-collateralized at the proven floor OR past the loan term.
    /// Time-based (past-due) liquidation needs no oracle; health needs a fresh price (a stale/absent
    /// price cannot push a position into liquidation — only into a documented "can't assess" state).
    fn is_liq(env: &Env, cfg: &Config, pos: &Position, debt: i128) -> bool {
        if env.ledger().sequence() > pos.due_ledger {
            return true;
        }
        let r = ReflectorClient::new(env, &cfg.reflector);
        if let Some(px) = r.lastprice(&cfg.reflector_asset) {
            if env.ledger().timestamp().saturating_sub(px.timestamp) <= MAX_PRICE_AGE_SECS {
                // collateral value at the proven floor, scaled by the liquidation threshold.
                let liq_value = journal::size_loan(pos.floor, px.price, r.decimals(), cfg.liq_bps);
                return liq_value < debt;
            }
        }
        false
    }

    // ---- views ----
    pub fn get_position(env: Env, position_id: BytesN<32>) -> Option<Position> {
        env.storage().persistent().get(&DataKey::Position(position_id))
    }
    /// Current debt (principal + accrued interest) of an active position.
    pub fn debt_of(env: Env, position_id: BytesN<32>) -> Result<i128, Error> {
        let cfg = Self::cfg(&env)?;
        let pos: Position = env
            .storage()
            .persistent()
            .get(&DataKey::Position(position_id))
            .ok_or(Error::NoPosition)?;
        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        Ok(pos.principal_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE)
    }
    pub fn get_pool(env: Env) -> Result<Pool, Error> {
        Self::pool(&env)
    }
    pub fn total_assets(env: Env) -> Result<i128, Error> {
        Ok(Self::assets_of(&Self::pool(&env)?))
    }
    pub fn shares_of(env: Env, who: Address) -> i128 {
        Self::share_balance(&env, &who)
    }
    pub fn is_root_known(env: Env, root: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Root(root))
    }
    /// Current Soroban repaid-root `R_sor` (Relayer B posts this to Ethereum for unlock proofs).
    pub fn repaid_root(env: Env) -> BytesN<32> {
        let rt: RepaidTree = env.storage().instance().get(&DataKey::RepaidTree).unwrap();
        rt.root
    }
    /// Number of repaid positions appended to the repaid-tree.
    pub fn repaid_count(env: Env) -> u32 {
        let rt: RepaidTree = env.storage().instance().get(&DataKey::RepaidTree).unwrap();
        rt.next_index
    }
    /// Current Soroban liquidated-root `R_liq` (Relayer C posts this to Ethereum for seize proofs).
    pub fn liquidated_root(env: Env) -> BytesN<32> {
        let lt: RepaidTree = env.storage().instance().get(&DataKey::LiquidatedTree).unwrap();
        lt.root
    }
    /// Number of liquidated positions appended to the liquidated-tree.
    pub fn liquidated_count(env: Env) -> u32 {
        let lt: RepaidTree = env.storage().instance().get(&DataKey::LiquidatedTree).unwrap();
        lt.next_index
    }
    /// Read-only liquidation check (returns false for missing/closed positions or config errors).
    pub fn is_liquidatable(env: Env, position_id: BytesN<32>) -> bool {
        let cfg = match Self::cfg(&env) {
            Ok(c) => c,
            Err(_) => return false,
        };
        let pos: Position = match env.storage().persistent().get(&DataKey::Position(position_id)) {
            Some(p) => p,
            None => return false,
        };
        if pos.status != STATUS_ACTIVE {
            return false;
        }
        let mut pool = match Self::pool(&env) {
            Ok(p) => p,
            Err(_) => return false,
        };
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        let debt = pos.principal_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE;
        Self::is_liq(&env, &cfg, &pos, debt)
    }
    pub fn is_lock_used(env: Env, lock_handle: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::LockUsed(lock_handle))
    }
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::cfg(&env)
    }

    // ---- internals ----
    fn cfg(env: &Env) -> Result<Config, Error> {
        env.storage().instance().get(&DataKey::Config).ok_or(Error::NotInitialized)
    }
    fn pool(env: &Env) -> Result<Pool, Error> {
        env.storage().instance().get(&DataKey::Pool).ok_or(Error::NotInitialized)
    }
    fn save_pool(env: &Env, pool: &Pool) {
        env.storage().instance().set(&DataKey::Pool, pool);
    }
    /// total_assets = idle + outstanding debt (scaled debt × index). Interest growth lifts this,
    /// so existing LP shares appreciate.
    fn assets_of(pool: &Pool) -> i128 {
        let debt = pool.total_borrowed_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE;
        pool.total_idle + debt
    }
    /// Lazy linear interest accrual into `borrow_index` over elapsed ledgers.
    fn accrue(env: &Env, pool: &mut Pool, rate_bps: u32) {
        let now = env.ledger().sequence();
        let elapsed = now.saturating_sub(pool.last_accrual);
        if elapsed > 0 && pool.total_borrowed_scaled > 0 && rate_bps > 0 {
            // Δindex = index × rate_bps × elapsed / (10_000 × ledgers_per_year)
            let delta = pool
                .borrow_index
                .checked_mul(rate_bps as i128).expect("ovf")
                .checked_mul(elapsed as i128).expect("ovf")
                / (10_000 * LEDGERS_PER_YEAR);
            pool.borrow_index += delta;
        }
        pool.last_accrual = now;
    }
    fn share_balance(env: &Env, who: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::Shares(who.clone())).unwrap_or(0)
    }
    fn add_shares(env: &Env, who: &Address, delta: i128) {
        let key = DataKey::Shares(who.clone());
        let cur = env.storage().persistent().get(&key).unwrap_or(0i128);
        env.storage().persistent().set(&key, &(cur + delta));
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }
    fn bump(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }
}
