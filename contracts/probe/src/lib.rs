//! Minimal probe to trigger a custom account's __check_auth on-chain: `run(account)` requires the
//! account's authorization, so the host invokes its __check_auth (which, for VeilAccount, verifies
//! a RISC Zero proof). Proves proof-as-authorization works as a real Soroban transaction.
#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct Probe;

#[contractimpl]
impl Probe {
    pub fn run(env: Env, who: Address) -> u32 {
        let _ = &env;
        who.require_auth();
        1
    }
}
