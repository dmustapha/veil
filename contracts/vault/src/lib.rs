//! # Veil Vault
//!
//! A minimal Soroban lending vault. A borrower presents a RISC Zero proof that an Ethereum
//! escrow holds collateral `>= T` under hashlock `H`, with the exact amount and their Ethereum
//! address kept private. `borrow` verifies the proof and disburses real Circle USDC **in one
//! atomic call** — a bad proof traps the whole call, so money only moves because of the proof.
//!
//! Liquidation lives on Ethereum (the escrow). The vault only records state: a loan, its
//! nullifier (one escrow lock -> one loan), and on repay the revealed secret `S` (so a relay can
//! unlock the Ethereum collateral). We never claim "trustless": the checkpoint poster, the
//! Reflector oracle, and the loan timeout are disclosed trust.
#![no_std]

mod journal;
#[cfg(test)]
mod test;

use journal::Journal;
use risc0_interface::RiscZeroVerifierClient;
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token,
    Address, Bytes, BytesN, Env, Symbol,
};

const DAY_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_LEDGERS;
const BUMP_THRESHOLD: u32 = BUMP_AMOUNT - DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    WrongEscrow = 3,
    UnknownCheckpoint = 4,
    CheckpointMismatch = 5,
    ThresholdTooLow = 6,
    NullifierUsed = 7,
    LoanExists = 8,
    NoLoan = 9,
    AlreadyClosed = 10,
    WrongSecret = 11,
    NotYetDue = 12,
    NoPrice = 13,
    LoanTooSmall = 14,
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
    pub escrow_addr: BytesN<20>,
    pub usdc: Address,
    pub reflector: Address,
    pub reflector_asset: Asset,
    pub ltv_bps: u32,
    pub min_threshold_wei: u128,
    pub term_ledgers: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct Loan {
    pub nullifier: BytesN<32>,
    pub threshold_wei: u128,
    pub principal: i128,
    pub borrower: Address,
    pub due_ledger: u32,
    pub repaid: bool,
    pub defaulted: bool,
}

#[contracttype]
enum DataKey {
    Config,
    Checkpoint(u64),     // block -> state_root
    Nullifier(BytesN<32>),
    Loan(BytesN<32>),    // H -> Loan
    Secret(BytesN<32>),  // H -> revealed S
}

#[contract]
pub struct VeilVault;

#[contractimpl]
impl VeilVault {
    /// One-time configuration. `admin` controls checkpoint posting.
    #[allow(clippy::too_many_arguments)]
    pub fn init(
        env: Env,
        admin: Address,
        verifier: Address,
        image_id: BytesN<32>,
        escrow_addr: BytesN<20>,
        usdc: Address,
        reflector: Address,
        reflector_asset: Asset,
        ltv_bps: u32,
        min_threshold_wei: u128,
        term_ledgers: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        let cfg = Config {
            admin, verifier, image_id, escrow_addr, usdc, reflector,
            reflector_asset, ltv_bps, min_threshold_wei, term_ledgers,
        };
        env.storage().instance().set(&DataKey::Config, &cfg);
        Ok(())
    }

    /// Post a canonical Ethereum (state_root, block). DISCLOSED TRUST: a light client replaces
    /// this in future work. Admin-gated.
    pub fn post_checkpoint(env: Env, block: u64, state_root: BytesN<32>) -> Result<(), Error> {
        let cfg = Self::cfg(&env)?;
        cfg.admin.require_auth();
        let key = DataKey::Checkpoint(block);
        env.storage().persistent().set(&key, &state_root);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Atomic verify-and-disburse. The proof gates real USDC. Returns the principal disbursed.
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

        // 3. Bind the proof to our escrow + a known checkpoint.
        if j.escrow != cfg.escrow_addr {
            return Err(Error::WrongEscrow);
        }
        let ck = DataKey::Checkpoint(j.block);
        let root: BytesN<32> = env.storage().persistent().get(&ck).ok_or(Error::UnknownCheckpoint)?;
        if root != j.state_root {
            return Err(Error::CheckpointMismatch);
        }
        if j.threshold_wei < cfg.min_threshold_wei {
            return Err(Error::ThresholdTooLow);
        }
        // 4. Replay protection + one-loan-per-lock.
        let nk = DataKey::Nullifier(j.nullifier.clone());
        if env.storage().persistent().has(&nk) {
            return Err(Error::NullifierUsed);
        }
        let lk = DataKey::Loan(j.hashlock.clone());
        if env.storage().persistent().has(&lk) {
            return Err(Error::LoanExists);
        }

        // 5. Size the loan from the live Reflector price.
        let r = ReflectorClient::new(&env, &cfg.reflector);
        let px = r.lastprice(&cfg.reflector_asset).ok_or(Error::NoPrice)?;
        let decimals = r.decimals();
        let principal = journal::size_loan(j.threshold_wei, px.price, decimals, cfg.ltv_bps);
        if principal <= 0 {
            return Err(Error::LoanTooSmall);
        }

        // 6. Disburse real USDC from the vault to the borrower.
        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&env.current_contract_address(), &borrower, &principal);

        // 7. Record loan + nullifier.
        let due = env.ledger().sequence() + cfg.term_ledgers;
        let loan = Loan {
            nullifier: j.nullifier.clone(),
            threshold_wei: j.threshold_wei,
            principal,
            borrower: borrower.clone(),
            due_ledger: due,
            repaid: false,
            defaulted: false,
        };
        env.storage().persistent().set(&lk, &loan);
        env.storage().persistent().set(&nk, &true);
        Self::bump(&env, &lk);
        Self::bump(&env, &nk);
        Ok(principal)
    }

    /// Repay the principal and reveal `S`. Storing `S` lets a relay unlock the Ethereum collateral.
    pub fn repay(env: Env, hashlock: BytesN<32>, secret: BytesN<32>) -> Result<(), Error> {
        let cfg = Self::cfg(&env)?;
        let lk = DataKey::Loan(hashlock.clone());
        let mut loan: Loan = env.storage().persistent().get(&lk).ok_or(Error::NoLoan)?;
        if loan.repaid || loan.defaulted {
            return Err(Error::AlreadyClosed);
        }
        // keccak256(S) must equal the hashlock (matches the Ethereum escrow's check).
        let computed = env
            .crypto()
            .keccak256(&Bytes::from_array(&env, &secret.to_array()))
            .to_bytes();
        if computed != hashlock {
            return Err(Error::WrongSecret);
        }
        loan.borrower.require_auth();

        let usdc = token::TokenClient::new(&env, &cfg.usdc);
        usdc.transfer(&loan.borrower, &env.current_contract_address(), &loan.principal);

        loan.repaid = true;
        env.storage().persistent().set(&lk, &loan);
        env.storage().persistent().set(&DataKey::Secret(hashlock.clone()), &secret);
        Self::bump(&env, &lk);
        Ok(())
    }

    /// Mark a loan defaulted after its term. Collateral is claimed on Ethereum (escrow timeout).
    pub fn liquidate_on_timeout(env: Env, hashlock: BytesN<32>) -> Result<(), Error> {
        Self::cfg(&env)?;
        let lk = DataKey::Loan(hashlock.clone());
        let mut loan: Loan = env.storage().persistent().get(&lk).ok_or(Error::NoLoan)?;
        if loan.repaid || loan.defaulted {
            return Err(Error::AlreadyClosed);
        }
        if env.ledger().sequence() <= loan.due_ledger {
            return Err(Error::NotYetDue);
        }
        loan.defaulted = true;
        env.storage().persistent().set(&lk, &loan);
        Self::bump(&env, &lk);
        Ok(())
    }

    // ---- views ----
    pub fn get_loan(env: Env, hashlock: BytesN<32>) -> Option<Loan> {
        env.storage().persistent().get(&DataKey::Loan(hashlock))
    }
    pub fn get_secret(env: Env, hashlock: BytesN<32>) -> Option<BytesN<32>> {
        env.storage().persistent().get(&DataKey::Secret(hashlock))
    }
    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Nullifier(nullifier))
    }
    pub fn get_checkpoint(env: Env, block: u64) -> Option<BytesN<32>> {
        env.storage().persistent().get(&DataKey::Checkpoint(block))
    }
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::cfg(&env)
    }

    // ---- internals ----
    fn cfg(env: &Env) -> Result<Config, Error> {
        env.storage().instance().get(&DataKey::Config).ok_or(Error::NotInitialized)
    }
    fn bump(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }
}
