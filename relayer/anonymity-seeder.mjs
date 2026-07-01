// Veil v2 anonymity-set seeder (on-chain submission).
//
// Consumes the decoy set emitted by `guest/host/src/bin/seed_anonymity.rs`
// (guest/anonymity-set.json) and plants each decoy as a REAL, backed AVAILABLE deposit in VeilPool:
// mint MockWstETH -> approve VeilPool -> deposit(amount, blinding, spendPk, encNote) for each decoy.
// A larger pool means a real borrower's lock-joinsplit hides among more notes (privacy = set size).
//
// PRIVACY: `blinding` and `spendPk` are ALREADY public for any deposit (VeilPool.deposit takes them
// as plaintext calldata and recomputes the commitment on-chain — item-9 disclosure). The seeder does
// NOT read or use `nk` (the spend key), so the decoy openings needed to reclaim escrow stay in the
// gitignored artifact only. This script broadcasts real txs and is deploy-gated (needs VeilPool +
// MockWstETH addresses + a funded key).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cfg, cast } from "./config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SET_PATH = join(here, "../guest/anonymity-set.json");

// ---- pure helpers (unit-tested; no network, no secrets) ----

/** Parse + validate the anonymity-set artifact into normalized decoys. */
export function loadDecoys(json) {
  const set = typeof json === "string" ? JSON.parse(json) : json;
  if (!Array.isArray(set?.decoys) || set.decoys.length === 0) {
    throw new Error("anonymity-set.json has no decoys (run the seed_anonymity emitter first)");
  }
  return set.decoys.map((d, i) => {
    for (const k of ["amount", "blinding", "spend_pk", "commitment"]) {
      if (typeof d[k] !== "string") throw new Error(`decoy ${i} missing field ${k}`);
    }
    return {
      index: Number.isInteger(d.index) ? d.index : i,
      amount: BigInt(d.amount),
      blinding: d.blinding,
      spendPk: d.spend_pk,
      commitment: d.commitment,
    };
  });
}

/** Total wstETH-units to mint/approve = sum of decoy amounts. */
export function totalAmount(decoys) {
  return decoys.reduce((sum, d) => sum + d.amount, 0n);
}

/**
 * Opaque encNote for a decoy: a deterministic, non-empty placeholder ciphertext. Decoys are never
 * decrypted, so this only needs to be a plausible blob (an empty encNote would make decoys stand out
 * from real deposits). Reuses the commitment bytes — public and already on-chain.
 */
export function decoyEncNote(decoy) {
  return decoy.commitment;
}

/** `cast send` argv for MockWstETH.mint(to, amount). */
export function mintArgs(wsteth, to, amount, rpc, key) {
  return ["send", wsteth, "mint(address,uint256)", to, amount.toString(),
    "--rpc-url", rpc, "--private-key", key];
}

/** `cast send` argv for MockWstETH.approve(spender, amount). */
export function approveArgs(wsteth, spender, amount, rpc, key) {
  return ["send", wsteth, "approve(address,uint256)", spender, amount.toString(),
    "--rpc-url", rpc, "--private-key", key];
}

/** `cast send` argv for VeilPool.deposit(uint128 amount, bytes32 blinding, bytes32 spendPk, bytes encNote). */
export function depositArgs(pool, decoy, encNote, rpc, key) {
  return ["send", pool, "deposit(uint128,bytes32,bytes32,bytes)",
    decoy.amount.toString(), decoy.blinding, decoy.spendPk, encNote,
    "--rpc-url", rpc, "--private-key", key];
}

// ---- execution (deploy-gated) ----

export async function seed({
  setPath = DEFAULT_SET_PATH,
  pool = cfg.veilPool,
  wsteth = cfg.wstETH,
  deployer,
  rpc = cfg.sepoliaRpc,
  key = cfg.ethKey,
} = {}) {
  if (!pool) throw new Error("VEILPOOL_ADDRESS not set — deploy VeilPool first");
  if (!wsteth) throw new Error("WSTETH_ADDRESS not set — deploy MockWstETH first");
  if (!key) throw new Error("PRIVATE_KEY not set — cannot sign deposits");

  const decoys = loadDecoys(readFileSync(setPath, "utf8"));
  const total = totalAmount(decoys);
  if (!deployer) deployer = cast(["wallet", "address", "--private-key", key]);

  console.log(`seeding ${decoys.length} decoys into ${pool}, total ${total} wstETH-units`);
  cast(mintArgs(wsteth, deployer, total, rpc, key));
  cast(approveArgs(wsteth, pool, total, rpc, key));
  for (const d of decoys) {
    cast(depositArgs(pool, d, decoyEncNote(d), rpc, key));
    console.log(`  decoy #${d.index} deposited (${d.amount} wstETH-units)`);
  }
  console.log("✅ anonymity set seeded on-chain.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((e) => {
    console.error(String(e.message || e));
    process.exit(1);
  });
}
