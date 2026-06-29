// Veil Relayer B (DISCLOSED TRUST) — Soroban repaid-root → Ethereum VeilPool.
//
// The reverse of Relayer A. Reads the Soroban vault's repaid-root `R_sor`
// (`VeilVault.repaid_root()`) and posts it to the Ethereum VeilPool via
// `addSorobanRoot(R_sor)`, so the pool will accept an unlock proof whose repay-membership path
// anchors to a real Stellar repaid-state. This is the infra v1 lacked entirely — the reverse
// attestation that lets a borrower recover LOCKED collateral, and ONLY after repaying. Same
// disclosed-trust model as Relayer A: it cannot forge — a wrong root just makes unlock proofs
// fail. Wormhole committee + a ZK proof of the repay semantics replaces it in future work.
//
//   node soroban-root-relayer.mjs              # one-shot: post R_sor if it changed
//   node soroban-root-relayer.mjs --watch      # poll and post on each new R_sor
import { fileURLToPath } from "node:url";
import { cfg, cast, stellar, sleep } from "./config.mjs";
import { parseBytes32, normalizeRoot, shouldPost } from "./root-relayer.mjs";

const POLL_MS = 15_000;

// --- pure helper (unit-tested) ---

/** Parse a cast bool ("true"/"false"), tolerant of surrounding log noise. */
export function parseBool(stdout) {
  return /\btrue\b/.test(String(stdout));
}

// --- chain I/O (integration; exercised against live testnet, not in unit tests) ---

/** Read the Soroban vault's repaid-root R_sor. Returns a 0x-prefixed lowercase bytes32. */
export function repaidRoot() {
  if (!cfg.vaultV2) throw new Error("VAULT_V2_ID unset — deploy VeilVault v2 first");
  const out = stellar(cfg.vaultV2, ["repaid_root"], { send: false });
  const r = parseBytes32(out);
  if (!r) throw new Error(`could not parse repaid_root: ${out}`);
  return r;
}

/** True if VeilPool already recorded this Soroban root (durable dedup across restarts). */
export function ethKnowsRoot(root) {
  if (!cfg.veilPool) throw new Error("VEILPOOL_ADDRESS unset — deploy VeilPool first");
  const arg = "0x" + normalizeRoot(root);
  const out = cast(["call", cfg.veilPool, "knownSorobanRoots(bytes32)(bool)", arg, "--rpc-url", cfg.sepoliaRpc]);
  return parseBool(out);
}

/** Post R_sor to VeilPool.addSorobanRoot on Ethereum (relayer-gated; uses the configured key). */
export function postSorobanRoot(root) {
  if (!cfg.veilPool) throw new Error("VEILPOOL_ADDRESS unset — deploy VeilPool first");
  const hex = "0x" + normalizeRoot(root);
  cast(["send", cfg.veilPool, "addSorobanRoot(bytes32)", hex, "--private-key", cfg.ethKey, "--rpc-url", cfg.sepoliaRpc]);
  console.log(`✓ posted R_sor ${hex} → VeilPool ${cfg.veilPool}`);
}

async function once(lastPosted) {
  const current = repaidRoot();
  if (shouldPost(current, lastPosted) && !ethKnowsRoot(current)) {
    postSorobanRoot(current);
    return normalizeRoot(current);
  }
  console.log(`R_sor ${current} already known / unchanged; nothing to post`);
  return normalizeRoot(current);
}

async function watch() {
  console.log("Soroban-root relayer watching vault", cfg.vaultV2, "→ VeilPool", cfg.veilPool);
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
