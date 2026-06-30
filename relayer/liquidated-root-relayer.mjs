// Veil Relayer C (DISCLOSED TRUST) — Soroban liquidated-root → Ethereum VeilPool.
//
// The seize counterpart of Relayer B. Reads the Soroban vault's liquidated-root `R_liq`
// (`VeilVault.liquidated_root()`) and posts it to the Ethereum VeilPool via
// `addLiquidatedRoot(R_liq)`, so the pool will accept a seize proof whose default-membership path
// anchors to a real Stellar liquidation. Same disclosed-trust model as Relayers A/B: it cannot
// forge — a wrong root just makes seize proofs fail. Wormhole committee + a ZK proof of the
// liquidation semantics replaces it in future work.
//
//   node liquidated-root-relayer.mjs              # one-shot: post R_liq if it changed
//   node liquidated-root-relayer.mjs --watch      # poll and post on each new R_liq
import { fileURLToPath } from "node:url";
import { cfg, cast, stellar, sleep } from "./config.mjs";
import { parseBytes32, normalizeRoot, shouldPost } from "./root-relayer.mjs";
import { parseBool } from "./soroban-root-relayer.mjs";

const POLL_MS = 15_000;

// --- chain I/O (integration; exercised against live testnet, not in unit tests) ---

/** Read the Soroban vault's liquidated-root R_liq. Returns a 0x-prefixed lowercase bytes32. */
export function liquidatedRoot() {
  if (!cfg.vaultV2) throw new Error("VAULT_V2_ID unset — deploy VeilVault v2 first");
  const out = stellar(cfg.vaultV2, ["liquidated_root"], { send: false });
  const r = parseBytes32(out);
  if (!r) throw new Error(`could not parse liquidated_root: ${out}`);
  return r;
}

/** True if VeilPool already recorded this Soroban liquidated-root (durable dedup across restarts). */
export function ethKnowsLiquidatedRoot(root) {
  if (!cfg.veilPool) throw new Error("VEILPOOL_ADDRESS unset — deploy VeilPool first");
  const arg = "0x" + normalizeRoot(root);
  const out = cast(["call", cfg.veilPool, "knownLiquidatedRoots(bytes32)(bool)", arg, "--rpc-url", cfg.sepoliaRpc]);
  return parseBool(out);
}

/** Post R_liq to VeilPool.addLiquidatedRoot on Ethereum (relayer-gated; uses the configured key). */
export function postLiquidatedRoot(root) {
  if (!cfg.veilPool) throw new Error("VEILPOOL_ADDRESS unset — deploy VeilPool first");
  const hex = "0x" + normalizeRoot(root);
  cast(["send", cfg.veilPool, "addLiquidatedRoot(bytes32)", hex, "--private-key", cfg.ethKey, "--rpc-url", cfg.sepoliaRpc]);
  console.log(`✓ posted R_liq ${hex} → VeilPool ${cfg.veilPool}`);
}

async function once(lastPosted) {
  const current = liquidatedRoot();
  if (shouldPost(current, lastPosted) && !ethKnowsLiquidatedRoot(current)) {
    postLiquidatedRoot(current);
    return normalizeRoot(current);
  }
  console.log(`R_liq ${current} already known / unchanged; nothing to post`);
  return normalizeRoot(current);
}

async function watch() {
  console.log("Liquidated-root relayer watching vault", cfg.vaultV2, "→ VeilPool", cfg.veilPool);
  let last = null;
  for (;;) {
    try {
      last = await once(last);
    } catch (e) {
      console.error("relayer error (continuing):", e.message);
    }
    await sleep(POLL_MS);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--watch")) {
    watch();
  } else {
    once(null).catch((e) => {
      console.error("relayer error:", e.message);
      process.exit(1);
    });
  }
}
