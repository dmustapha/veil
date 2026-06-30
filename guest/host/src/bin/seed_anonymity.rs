//! Veil v2 anonymity-set seeder (emitter).
//!
//! Builds a deterministic decoy AVAILABLE-note set with `veil_core::decoy` and writes a
//! deposit-ready artifact (`anonymity-set.json`) that the deploy-time submission loop feeds to
//! `VeilPool.deposit(amount, blinding, spendPk, encNote)` — one real, backed wstETH deposit per
//! decoy, so genuine deposits/locks hide in the crowd. The on-chain submission itself is
//! deploy-gated (needs a live VeilPool + MockWstETH); this stage produces the inputs offline.
//!
//! PRIVACY: only the PUBLIC leaf data (index, amount, commitment) is printed. The seed-derived
//! `blinding`/`spendPk` openings are the seeder's own secrets (used to reclaim escrow later), are
//! written ONLY to the gitignored `anonymity-set.json`, and are never logged. The master seed is
//! never written — only a one-way fingerprint — so the file alone reclaims escrow but does not leak
//! the seed that would let anyone regenerate future decoys.
//!
//! Usage: `cargo run --bin seed_anonymity -- [count]`  (default 8).
//! Override the master seed (production) with `VEIL_DECOY_SEED=<64 hex chars>`.
use sha2::{Digest, Sha256};
use veil_core::decoy::decoy_set;

/// A menu of plausible wstETH-unit deposit sizes (1e18 = 1.0 wstETH) so the set looks like organic
/// deposits rather than a uniform block. Cycled across the requested decoy count.
const AMOUNT_MENU: [u128; 6] = [
    50_000_000_000_000_000,    // 0.05
    250_000_000_000_000_000,   // 0.25
    500_000_000_000_000_000,   // 0.50
    1_000_000_000_000_000_000, // 1.00
    1_500_000_000_000_000_000, // 1.50
    2_000_000_000_000_000_000, // 2.00
];

fn load_seed() -> [u8; 32] {
    match std::env::var("VEIL_DECOY_SEED") {
        Ok(hex_seed) => {
            let bytes = hex::decode(hex_seed.trim_start_matches("0x"))
                .expect("VEIL_DECOY_SEED must be hex");
            assert_eq!(bytes.len(), 32, "VEIL_DECOY_SEED must be 32 bytes (64 hex chars)");
            bytes.try_into().unwrap()
        }
        // Fixed demo seed: reproducible anonymity set for the demo. Production MUST pass a real
        // secret seed via VEIL_DECOY_SEED (whoever holds it can reclaim every decoy's escrow).
        Err(_) => [0x5e; 32],
    }
}

fn main() {
    let count: usize = std::env::args()
        .nth(1)
        .map(|a| a.parse().expect("count must be a number"))
        .unwrap_or(8);

    let seed = load_seed();
    let amounts: Vec<u128> = (0..count).map(|i| AMOUNT_MENU[i % AMOUNT_MENU.len()]).collect();
    let decoys = decoy_set(&seed, &amounts);

    // One-way seed fingerprint (NOT the seed) so the artifact is traceable without leaking it.
    let seed_fp = Sha256::digest(seed);
    let total: u128 = decoys.iter().map(|d| d.amount).sum();

    let json = serde_json::json!({
        "note": "Decoy anonymity set for VeilPool.deposit. blinding/spend_pk are seeder secrets — do not commit.",
        "seed_fingerprint": format!("0x{}", hex::encode(&seed_fp[..8])),
        "count": decoys.len(),
        "total_amount": total.to_string(),
        "decoys": decoys.iter().map(|d| serde_json::json!({
            "index": d.index,
            "amount": d.amount.to_string(),
            "blinding": format!("0x{}", hex::encode(d.blinding)),
            "spend_pk": format!("0x{}", hex::encode(d.spend_pk)),
            "nk": format!("0x{}", hex::encode(d.nk)),
            "commitment": format!("0x{}", hex::encode(d.commitment)),
        })).collect::<Vec<_>>(),
    });
    std::fs::write("anonymity-set.json", serde_json::to_string_pretty(&json).unwrap()).unwrap();

    // PUBLIC output only — never the openings.
    println!("✅ anonymity set: {} decoys, total escrow {total} wstETH-units", decoys.len());
    println!("seed fingerprint = 0x{}", hex::encode(&seed_fp[..8]));
    for d in &decoys {
        println!("  decoy #{:>2}  amount={:>22}  commitment=0x{}", d.index, d.amount, hex::encode(d.commitment));
    }
    println!("→ wrote anonymity-set.json (openings inside are seeder secrets — gitignored)");
}
