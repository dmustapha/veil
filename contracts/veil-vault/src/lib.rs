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
    contract, contractclient, contracterror, contractimpl, contracttype,
    crypto::bn254::Bn254Fr, token, Address, Bytes, BytesN, Env, Symbol, Vec, U256,
};
use veil_verifier::{Groth16Error, Groth16Proof};

const DAY_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_LEDGERS;
const BUMP_THRESHOLD: u32 = BUMP_AMOUNT - DAY_LEDGERS;
const MAX_PRICE_AGE_SECS: u64 = 1_800;

/// BN254 scalar field modulus `r` (big-endian) — the borrower binding is reduced mod `r` so it is a
/// valid circuit public input.
const BN254_R: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

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

/// The deployed Groth16 borrow verifier. `verify` returns `Ok(true)` for a valid proof and TRAPS
/// (reverts the borrow) on an invalid proof or mismatched public inputs — the fail-closed contract
/// the audit requires. Public inputs must be in snarkjs order.
#[contractclient(name = "VerifierClient")]
pub trait VerifierIface {
    fn verify(
        env: Env,
        proof: Groth16Proof,
        public_inputs: Vec<Bn254Fr>,
    ) -> Result<bool, Groth16Error>;
}

/// The veil-pool shielded pool — the single source of truth for known Merkle roots.
#[contractclient(name = "PoolClient")]
pub trait PoolIface {
    fn is_known_root(env: Env, root: U256) -> bool;
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
    pub position_id: U256, // circuit output (Poseidon field element)
    pub lock_handle: U256, // circuit output
    pub borrower: Address,
    pub principal: i128,
    pub principal_scaled: i128,
    pub floor: u128,
    pub root: U256,
    pub due_ledger: u32,
    pub status: u32,
}

#[contracttype]
enum DataKey {
    Config,
    Pool,
    Position(U256),
    LockUsed(U256),
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

    /// Atomic verify-and-lend. A valid Circom→Groth16 borrow proof (verified by the deployed BN254
    /// verifier) gates real USDC. `position_id`, `lock_handle`, `root`, `threshold` are the proof's
    /// public signals; `borrower` binds the proof to the caller. Returns the principal disbursed.
    pub fn borrow(
        env: Env,
        proof: Groth16Proof,
        position_id: U256,
        lock_handle: U256,
        root: U256,
        threshold: u128,
        borrower: Address,
    ) -> Result<i128, Error> {
        borrower.require_auth();
        let cfg = Self::cfg(&env)?;

        // 1. Verify the proof against the borrow public signals (snarkjs order); an invalid proof or
        //    any mismatched public value TRAPS the whole call (fail-closed). The borrower field binds
        //    the proof to the caller (anti-replay).
        Self::verify_borrow_proof(
            &env, &cfg.borrow_verifier, &proof, &position_id, &lock_handle, &root, threshold, &borrower,
        );

        // 2. The membership root must be a known veil-pool root (cross-contract single source).
        if !PoolClient::new(&env, &cfg.veil_pool).is_known_root(&root) {
            return Err(Error::UnknownRoot);
        }
        // 3. One lock -> one loan, FOREVER (the tree is append-only). Reject duplicate position.
        if env.storage().persistent().has(&DataKey::LockUsed(lock_handle.clone())) {
            return Err(Error::LockHandleUsed);
        }
        if env.storage().persistent().has(&DataKey::Position(position_id.clone())) {
            return Err(Error::PositionExists);
        }
        if threshold < cfg.min_threshold {
            return Err(Error::ThresholdTooLow);
        }

        // 4. Size the loan from the live Reflector price (reject a stale price).
        let r = ReflectorClient::new(&env, &cfg.reflector);
        let px = r.lastprice(&cfg.reflector_asset).ok_or(Error::NoPrice)?;
        if env.ledger().timestamp().saturating_sub(px.timestamp) > MAX_PRICE_AGE_SECS {
            return Err(Error::StalePrice);
        }
        let principal = size_loan(threshold, px.price, r.decimals(), cfg.ltv_bps);
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
            position_id: position_id.clone(),
            lock_handle: lock_handle.clone(),
            borrower: borrower.clone(),
            principal,
            principal_scaled,
            floor: threshold,
            root: root.clone(),
            due_ledger: due,
            status: STATUS_ACTIVE,
        };
        pool.total_idle -= principal;
        pool.total_borrowed_scaled += principal_scaled;
        let pk = DataKey::Position(position_id.clone());
        env.storage().persistent().set(&pk, &pos);
        env.storage().persistent().set(&DataKey::LockUsed(lock_handle.clone()), &true);
        Self::save_pool(&env, &pool);

        // 7. Disburse real USDC to the borrower (interaction last).
        token::TokenClient::new(&env, &cfg.usdc).transfer(
            &env.current_contract_address(),
            &borrower,
            &principal,
        );
        Self::bump(&env, &pk);
        Self::bump(&env, &DataKey::LockUsed(lock_handle));
        Ok(principal)
    }

    /// Private margin call. Under price stress the borrower re-proves — via the SAME deployed borrow
    /// verifier — that the SAME locked note clears a HIGHER floor `T'`, and raises `Position.floor`
    /// to `T'`. This defends the position by disclosing a tighter lower bound, never the exact amount.
    /// Soroban-only: no new disbursement, no re-lock. The raised floor strengthens the liquidation
    /// predicate. Returns the new floor.
    pub fn margin(
        env: Env,
        proof: Groth16Proof,
        position_id: U256,
        lock_handle: U256,
        root: U256,
        threshold: u128,
        borrower: Address,
    ) -> Result<u128, Error> {
        borrower.require_auth();
        let cfg = Self::cfg(&env)?;

        // 1. Verify the higher-threshold proof (same verifier/public-signal shape as borrow; T larger).
        Self::verify_borrow_proof(
            &env, &cfg.borrow_verifier, &proof, &position_id, &lock_handle, &root, threshold, &borrower,
        );
        // 2. Membership root must be a known veil-pool root.
        if !PoolClient::new(&env, &cfg.veil_pool).is_known_root(&root) {
            return Err(Error::UnknownRoot);
        }
        // 3. The position must exist, be active, and belong to the caller.
        let pk = DataKey::Position(position_id);
        let mut pos: Position = env.storage().persistent().get(&pk).ok_or(Error::NoPosition)?;
        if pos.status != STATUS_ACTIVE {
            return Err(Error::AlreadyClosed);
        }
        if pos.borrower != borrower {
            return Err(Error::WrongBorrower);
        }
        // 4. Must re-prove the SAME locked note (margin can't swap collateral).
        if lock_handle != pos.lock_handle {
            return Err(Error::LockMismatch);
        }
        // 5. A margin call only ever TIGHTENS the floor (strictly raises the proven lower bound).
        if threshold <= pos.floor {
            return Err(Error::FloorNotRaised);
        }

        pos.floor = threshold;
        env.storage().persistent().set(&pk, &pos);
        Self::bump(&env, &pk);
        Ok(threshold)
    }

    /// Repay principal + accrued interest and mark the position REPAID. Appends
    /// `repaid_leaf(lock_handle)` to the Poseidon repaid-tree → the new `R_sor` the unlock circuit
    /// proves membership against (so collateral is recoverable ONLY after repayment). Returns the
    /// amount repaid.
    pub fn repay(env: Env, position_id: U256) -> Result<i128, Error> {
        let cfg = Self::cfg(&env)?;
        let pk = DataKey::Position(position_id);
        let mut pos: Position = env.storage().persistent().get(&pk).ok_or(Error::NoPosition)?;
        if pos.status != STATUS_ACTIVE {
            return Err(Error::AlreadyClosed);
        }
        pos.borrower.require_auth();

        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        let debt = pos.principal_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE;

        token::TokenClient::new(&env, &cfg.usdc).transfer(
            &pos.borrower,
            &env.current_contract_address(),
            &debt,
        );

        pool.total_idle += debt;
        pool.total_borrowed_scaled -= pos.principal_scaled;
        pos.status = STATUS_REPAID;
        let lock_handle = pos.lock_handle.clone();
        env.storage().persistent().set(&pk, &pos);
        Self::save_pool(&env, &pool);
        Self::bump(&env, &pk);
        Self::append_leaf(&env, DataKey::RepaidTree, tree::repaid_leaf(&env, &lock_handle));
        Ok(debt)
    }

    /// Liquidate a defaulted position. Permissionless: any `liquidator` may call, but they must repay
    /// the debt to the pool (LPs made whole) — in return they recover the locked collateral on-chain
    /// via the seize proof (worth ≥ the proven floor). Liquidatable iff under-collateralized at the
    /// proven floor (`floor·price·liq_bps < debt`) OR past the loan term. Marks LIQUIDATED and appends
    /// `liquidated_leaf(lock_handle)` to `R_liq` — the default-proof the seize circuit folds. Returns
    /// the debt absorbed.
    pub fn liquidate(env: Env, position_id: U256, liquidator: Address) -> Result<i128, Error> {
        let cfg = Self::cfg(&env)?;
        let pk = DataKey::Position(position_id);
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

        token::TokenClient::new(&env, &cfg.usdc).transfer(
            &liquidator,
            &env.current_contract_address(),
            &debt,
        );

        pool.total_idle += debt;
        pool.total_borrowed_scaled -= pos.principal_scaled;
        pos.status = STATUS_LIQUIDATED;
        let lock_handle = pos.lock_handle.clone();
        env.storage().persistent().set(&pk, &pos);
        Self::save_pool(&env, &pool);
        Self::bump(&env, &pk);
        Self::append_leaf(&env, DataKey::LiquidatedTree, tree::liquidated_leaf(&env, &lock_handle));
        Ok(debt)
    }

    /// Liquidation predicate: under-collateralized at the proven floor OR past the loan term.
    /// Past-due needs no oracle; the health check needs a FRESH price (a stale/absent price can never
    /// push a position into liquidation — only leave it un-assessable).
    fn is_liq(env: &Env, cfg: &Config, pos: &Position, debt: i128) -> bool {
        if env.ledger().sequence() > pos.due_ledger {
            return true;
        }
        let r = ReflectorClient::new(env, &cfg.reflector);
        if let Some(px) = r.lastprice(&cfg.reflector_asset) {
            if env.ledger().timestamp().saturating_sub(px.timestamp) <= MAX_PRICE_AGE_SECS {
                let liq_value = size_loan(pos.floor, px.price, r.decimals(), cfg.liq_bps);
                return liq_value < debt;
            }
        }
        false
    }

    // ---- views ----
    pub fn get_position(env: Env, position_id: U256) -> Option<Position> {
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
    pub fn is_lock_used(env: Env, lock_handle: U256) -> bool {
        env.storage().persistent().has(&DataKey::LockUsed(lock_handle))
    }
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::cfg(&env)
    }
    /// Current debt (principal + accrued interest) of an active position.
    pub fn debt_of(env: Env, position_id: U256) -> Result<i128, Error> {
        let cfg = Self::cfg(&env)?;
        let pos: Position =
            env.storage().persistent().get(&DataKey::Position(position_id)).ok_or(Error::NoPosition)?;
        let mut pool = Self::pool(&env)?;
        Self::accrue(&env, &mut pool, cfg.rate_bps);
        Ok(pos.principal_scaled.checked_mul(pool.borrow_index).expect("ovf") / INDEX_SCALE)
    }
    /// Read-only liquidation check (false for missing/closed positions or config errors).
    pub fn is_liquidatable(env: Env, position_id: U256) -> bool {
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
    /// A field-element value (Poseidon output / reduced hash) → BN254 scalar for a circuit public
    /// input. All inputs here are already < r (Poseidon outputs, u128, or keccak-reduced), so the
    /// 32-byte value is a canonical field element.
    fn fr(env: &Env, v: &U256) -> Bn254Fr {
        let b: BytesN<32> = v.to_be_bytes().try_into().expect("U256 is 32 bytes");
        let _ = env;
        Bn254Fr::from_bytes(b)
    }
    fn fr_u128(env: &Env, v: u128) -> Bn254Fr {
        let mut b = [0u8; 32];
        b[16..].copy_from_slice(&v.to_be_bytes());
        Bn254Fr::from_bytes(BytesN::from_array(env, &b))
    }
    /// Bind a proof to the caller: `borrower = keccak256(strkey) mod r`. The prover must set the
    /// circuit's `borrower` public signal to this exact value, so a stolen proof can't be redeemed
    /// from another account (v2's anti-replay, ported to a field element).
    fn borrower_field(env: &Env, who: &Address) -> U256 {
        let strkey = who.to_string().to_bytes();
        let h = env.crypto().keccak256(&strkey).to_bytes();
        let hu = U256::from_be_bytes(env, &Bytes::from_array(env, &h.to_array()));
        let r = U256::from_be_bytes(env, &Bytes::from_array(env, &BN254_R));
        hu.rem_euclid(&r)
    }
    /// Build the borrow public-signal vector in SNARKJS ORDER `[positionId, lockHandle, root,
    /// threshold, borrower]` and call the deployed borrow verifier. `borrower` is reduced to its
    /// invoker-bound field element first. TRAPS (reverts) on an invalid proof or mismatched input —
    /// callers must treat a return as "verified". Shared by `borrow` and `margin`.
    #[allow(clippy::too_many_arguments)]
    fn verify_borrow_proof(
        env: &Env,
        verifier: &Address,
        proof: &Groth16Proof,
        position_id: &U256,
        lock_handle: &U256,
        root: &U256,
        threshold: u128,
        borrower: &Address,
    ) {
        let bfield = Self::borrower_field(env, borrower);
        let mut pi: Vec<Bn254Fr> = Vec::new(env);
        pi.push_back(Self::fr(env, position_id));
        pi.push_back(Self::fr(env, lock_handle));
        pi.push_back(Self::fr(env, root));
        pi.push_back(Self::fr_u128(env, threshold));
        pi.push_back(Self::fr(env, &bfield));
        VerifierClient::new(env, verifier).verify(proof, &pi);
    }
    /// Append a Poseidon leaf to a gating tree (repaid `R_sor` / liquidated `R_liq`) and persist it,
    /// bumping the instance TTL. The new root lines up with the circom `MerkleProof` for that leaf.
    fn append_leaf(env: &Env, key: DataKey, leaf: U256) {
        let mut t: GatingTree = env.storage().instance().get(&key).expect("gating tree");
        tree::insert(env, &mut t, leaf);
        env.storage().instance().set(&key, &t);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
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
    fn bump(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }
}

/// Size a loan in USDC (7 decimals) from a wstETH-unit threshold, a Reflector price, and an LTV —
/// ported from vault-v2 `journal::size_loan`. Returns 0 on a non-positive price or a bad LTV (→
/// LoanTooSmall in `borrow`, never a panic). `loan = (t/1e11)·px·ltv_bps / 10^(4+px_decimals)`.
fn size_loan(t_units: u128, px: i128, px_decimals: u32, ltv_bps: u32) -> i128 {
    if px <= 0 || ltv_bps == 0 || ltv_bps > 10_000 {
        return 0;
    }
    let reduced = (t_units / 100_000_000_000u128) as i128; // t_units / 1e11
    let num = match reduced.checked_mul(px).and_then(|n| n.checked_mul(ltv_bps as i128)) {
        Some(n) => n,
        None => return 0,
    };
    let denom = 10i128.pow(4 + px_decimals);
    num / denom
}
