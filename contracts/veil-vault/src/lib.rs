//! # Veil Vault (v3, Soroban-native) — private margin lending
//!
//! The v3 rewire of `contracts/vault-v2`. A borrower presents a **Circom→Groth16 proof** (verified
//! by the deployed BN254 verifier contracts) that a LOCKED shielded note in the Soroban `veil-pool`
//! clears a threshold floor `T`, with the exact collateral kept private. `borrow` verifies the proof
//! and lends USDC from an ERC-4626 LP pool against `T`, accruing interest via a global `borrow_index`.
//!
//! v3 vs v2: the proof path is Groth16 (not RISC Zero) and membership is checked against the Soroban
//! `veil-pool` root via a cross-contract call (not a relayed Ethereum root) — so the Ethereum leg and
//! the relayers are gone. The LP / interest / liquidation / gating-tree logic is reused verbatim.
//!
//! This file (unit 1) is the LP + interest + config skeleton; the Groth16 borrow/margin path
//! (units 3–4) and the Poseidon repaid/liquidated gating trees (unit 2) land next.
#![no_std]

#[cfg(test)]
mod test;
mod tree;

use tree::GatingTree;

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, BytesN,
    Env, Symbol, U256,
};

const DAY_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_LEDGERS;
const BUMP_THRESHOLD: u32 = BUMP_AMOUNT - DAY_LEDGERS;

/// Fixed-point scale for the interest index (1.0 == 1e9).
const INDEX_SCALE: i128 = 1_000_000_000;
/// Ledgers per year (≈365 d × 17_280 ledgers/d), the interest-accrual denominator.
const LEDGERS_PER_YEAR: i128 = 365 * DAY_LEDGERS as i128;

/// Position lifecycle.
pub const STATUS_ACTIVE: u32 = 0;
pub const STATUS_REPAID: u32 = 1;
pub const STATUS_LIQUIDATED: u32 = 2;

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
    InvalidProof = 19,
}

// ---- Reflector (SEP-40) minimal oracle interface ----
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

/// Vault configuration. v3: `borrow_verifier` is the deployed Groth16 verifier for the borrow/margin
/// circuit; `veil_pool` is the shielded-pool contract whose root membership `borrow` checks. (No
/// RISC Zero image id, no relayed-Ethereum-root admin — both replaced by the Soroban-native path.)
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub borrow_verifier: Address,
    pub veil_pool: Address,
    pub usdc: Address,
    pub reflector: Address,
    pub reflector_asset: Asset,
    pub ltv_bps: u32,
    pub liq_bps: u32,
    pub min_threshold: u128,
    pub term_ledgers: u32,
    pub rate_bps: u32,
}

/// Global ERC-4626 LP pool + interest accumulator.
#[contracttype]
#[derive(Clone)]
pub struct Pool {
    pub total_shares: i128,
    pub total_idle: i128,
    pub total_borrowed_scaled: i128,
    pub borrow_index: i128,
    pub last_accrual: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct Position {
    pub position_id: soroban_sdk::BytesN<32>,
    pub lock_handle: soroban_sdk::BytesN<32>,
    pub borrower: Address,
    pub principal: i128,
    pub principal_scaled: i128,
    pub floor: u128,
    pub root: soroban_sdk::U256,
    pub due_ledger: u32,
    pub status: u32,
}

#[contracttype]
enum DataKey {
    Config,
    Pool,
    Position(BytesN<32>),
    LockUsed(BytesN<32>),
    Shares(Address),
    RepaidTree,     // Poseidon repaid-position tree R_sor (unlock circuit proves membership)
    LiquidatedTree, // Poseidon liquidated-position tree R_liq (seize circuit proves membership)
}

#[contract]
pub struct VeilVault;

#[contractimpl]
impl VeilVault {
    /// Deploy-time configuration (atomic constructor — no post-deploy init front-run window).
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        borrow_verifier: Address,
        veil_pool: Address,
        usdc: Address,
        reflector: Address,
        reflector_asset: Asset,
        ltv_bps: u32,
        liq_bps: u32,
        min_threshold: u128,
        term_ledgers: u32,
        rate_bps: u32,
    ) {
        let cfg = Config {
            admin, borrow_verifier, veil_pool, usdc, reflector, reflector_asset,
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
        // Empty Poseidon gating trees; a leaf is appended on each repay / liquidation.
        env.storage().instance().set(&DataKey::RepaidTree, &tree::empty(&env));
        env.storage().instance().set(&DataKey::LiquidatedTree, &tree::empty(&env));
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
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
        // Reject a deposit that rounds to zero shares (ERC-4626 round-to-zero / inflation guard).
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

    // ---- views ----
    pub fn get_position(env: Env, position_id: soroban_sdk::BytesN<32>) -> Option<Position> {
        env.storage().persistent().get(&DataKey::Position(position_id))
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
    pub fn is_lock_used(env: Env, lock_handle: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::LockUsed(lock_handle))
    }
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::cfg(&env)
    }

    /// Current Poseidon repaid-root `R_sor` — the value the unlock circuit's `rootRepaid` public
    /// input must equal (read cross-contract by the veil-pool unlock op).
    pub fn repaid_root(env: Env) -> U256 {
        Self::repaid_tree(&env).root
    }
    /// Current Poseidon liquidated-root `R_liq` — the seize circuit's `rootLiquidated`.
    pub fn liquidated_root(env: Env) -> U256 {
        Self::liquidated_tree(&env).root
    }
    pub fn repaid_count(env: Env) -> u32 {
        Self::repaid_tree(&env).next_index
    }
    pub fn liquidated_count(env: Env) -> u32 {
        Self::liquidated_tree(&env).next_index
    }

    // ---- internals ----
    fn cfg(env: &Env) -> Result<Config, Error> {
        env.storage().instance().get(&DataKey::Config).ok_or(Error::NotInitialized)
    }
    fn pool(env: &Env) -> Result<Pool, Error> {
        env.storage().instance().get(&DataKey::Pool).ok_or(Error::NotInitialized)
    }
    fn repaid_tree(env: &Env) -> GatingTree {
        env.storage().instance().get(&DataKey::RepaidTree).expect("repaid tree")
    }
    fn liquidated_tree(env: &Env) -> GatingTree {
        env.storage().instance().get(&DataKey::LiquidatedTree).expect("liquidated tree")
    }
    fn save_pool(env: &Env, pool: &Pool) {
        env.storage().instance().set(&DataKey::Pool, pool);
    }
    /// total_assets = idle + outstanding debt (scaled debt × index). Interest growth lifts this, so
    /// existing LP shares appreciate.
    fn assets_of(pool: &Pool) -> i128 {
        let debt =
            pool.total_borrowed_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE;
        pool.total_idle + debt
    }
    /// Lazy linear interest accrual into `borrow_index` over elapsed ledgers.
    fn accrue(env: &Env, pool: &mut Pool, rate_bps: u32) {
        let now = env.ledger().sequence();
        let elapsed = now.saturating_sub(pool.last_accrual);
        if elapsed > 0 && pool.total_borrowed_scaled > 0 && rate_bps > 0 {
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
    #[allow(dead_code)]
    fn bump(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }
}
