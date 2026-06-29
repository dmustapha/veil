// Veil Relayer A (DISCLOSED TRUST) — shielded-pool root → Soroban vault.
//
// Reads the Ethereum VeilPool's current Merkle root (`getLastRoot()`) and posts it to the Soroban
// VeilVault via `add_root(root)`, so the vault will accept a borrow proof whose membership root R is
// a real Ethereum pool state. This is the single trusted component we disclose plainly: a Wormhole
// committee + a RISC Zero proof of the pool-root semantics replaces it in future work (documented as
// the endgame). It cannot forge anything — it only attests "this root is canonical on Ethereum." A
// wrong root simply makes every proof against it fail to verify on Soroban.
//
//   node root-relayer.mjs              # one-shot: post the pool's current root if it changed
//   node root-relayer.mjs --watch      # poll and post on each new root
import { fileURLToPath } from "node:url";
import { cfg, cast, stellar, sleep } from "./config.mjs";

const POLL_MS = 15_000;
const ZERO_ROOT = "0".repeat(64);

// --- pure helpers (unit-tested in root-relayer.test.mjs) ---

/** Extract a bytes32 from cast/stellar stdout, which may carry surrounding log noise.
 *  Returns a 0x-prefixed lowercase hex string, or null if none is present. Last match wins. */
export function parseBytes32(stdout) {
  for (const line of String(stdout).split("\n").map((l) => l.trim()).reverse()) {
    const m = line.match(/(?:0x)?([0-9a-fA-F]{64})\b/);
    if (m) return "0x" + m[1].toLowerCase();
  }
  return null;
}

/** Normalize a root to a bare 64-hex string (no 0x, lowercase). Throws if not a bytes32. */
export function normalizeRoot(raw) {
  const m = String(raw).trim().match(/^(?:0x)?([0-9a-fA-F]{64})$/);
  if (!m) throw new Error(`not a bytes32 root: ${raw}`);
  return m[1].toLowerCase();
}

/** Decide whether to relay `current`. Skip the all-zero root (uninitialized read) and any root
 *  already posted (idempotent — add_root is admin-gated and costs a tx). */
export function shouldPost(current, lastPosted) {
  const c = normalizeRoot(current);
  if (c === ZERO_ROOT) return false;
  if (lastPosted && normalizeRoot(lastPosted) === c) return false;
  return true;
}

// --- chain I/O (integration; exercised against live testnet, not in unit tests) ---

/** Read VeilPool.getLastRoot() on Ethereum. Returns a 0x-prefixed lowercase bytes32. */
export function poolRoot() {
  if (!cfg.veilPool) throw new Error("VEILPOOL_ADDRESS unset — deploy VeilPool first");
  const out = cast(["call", cfg.veilPool, "getLastRoot()(bytes32)", "--rpc-url", cfg.sepoliaRpc]);
  const r = parseBytes32(out);
  if (!r) throw new Error(`could not parse root from cast output: ${out}`);
  return r;
}

/** True if the vault already knows `root` (durable dedup across relayer restarts). */
export function rootKnown(root) {
  if (!cfg.vaultV2) throw new Error("VAULT_V2_ID unset — deploy VeilVault v2 first");
  const out = stellar(cfg.vaultV2, ["is_root_known", "--root", normalizeRoot(root)], { send: false });
  return /\btrue\b/.test(out);
}

/** Post `root` (0x-prefixed or bare) to the Soroban vault via add_root. */
export function postRoot(root) {
  if (!cfg.vaultV2) throw new Error("VAULT_V2_ID unset — deploy VeilVault v2 first");
  const bare = normalizeRoot(root);
  stellar(cfg.vaultV2, ["add_root", "--root", bare]);
  console.log(`✓ posted root ${"0x" + bare} → vault ${cfg.vaultV2}`);
}

async function once(lastPosted) {
  const current = poolRoot();
  // In-memory dedup + empty-tree guard first (cheap), then a durable on-chain check so a restart
  // never re-posts an already-known root. add_root accumulates, so every distinct root we relay
  // stays known — preserving the pool's history window for proof liveness across deposits.
  if (shouldPost(current, lastPosted) && !rootKnown(current)) {
    postRoot(current);
    return normalizeRoot(current);
  }
  console.log(`root ${current} already known / unchanged; nothing to post`);
  return normalizeRoot(current);
}

async function watch() {
  console.log("root relayer watching VeilPool", cfg.veilPool, "→ vault", cfg.vaultV2);
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

// Run only when invoked directly (so unit tests can import the helpers cleanly).
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
