// Veil v3 eth-lock relayer (DISCLOSED TRUST) — Sepolia VeilEthLock → Soroban veil-pool.attest_lock.
//
// Watches `VeilEthLock.Locked(uint256 commitment, uint256 amount, address owner)` on Sepolia and
// mirrors each real WETH lock into the Soroban veil-pool: `attest_lock(commitment, amount)` inserts
// the AVAILABLE note into the shielded tree so the borrower can lock+borrow on Stellar. The ETH stays
// on Ethereum; only (commitment, amount) cross over. `C` is already bound to `amount` on Ethereum (an
// on-chain Groth16 opening proof in VeilEthLock.lock), so the relayer cannot inflate a note — a wrong
// mirror just fails downstream. This is the documented trust boundary (a multisig / light client
// replaces the single relayer in future work); attest_lock is idempotent per commitment on-chain.
//
//   node eth-lock-relayer.mjs               # one-shot: attest all locks since --from-block (or 0)
//   node eth-lock-relayer.mjs --watch       # poll and attest new locks
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { cfg, cast, sleep } from "./config.mjs";

const POLL_MS = 15_000;
export const LOCKED_SIG = "Locked(uint256,uint256,address)";

// ---- pure helpers (unit-tested; no network, no secrets) ----

/** Decode a `cast logs --json` entry for Locked into {commitment, amount, owner} (bigints + strkey). */
export function decodeLockedLog(log) {
  const topics = log.topics || [];
  if (topics.length < 3) throw new Error(`Locked log needs 3 topics, got ${topics.length}`);
  const commitment = BigInt(topics[1]); // indexed uint256
  const owner = "0x" + topics[2].slice(-40); // indexed address (right-aligned in the 32-byte topic)
  const amount = BigInt(log.data); // sole non-indexed uint256 in data
  if (amount <= 0n) throw new Error("Locked amount must be positive");
  return { commitment, amount, owner };
}

/** Parse the (possibly noisy) `cast logs --json` stdout into an array of decoded locks, in order. */
export function decodeLockedLogs(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) return [];
  const logs = JSON.parse(stdout.slice(start));
  return logs.map(decodeLockedLog);
}

// ---- chain I/O (integration; exercised against live testnet, not in unit tests) ----

/** Fetch Locked events from VeilEthLock since `fromBlock` (decoded, in log order). */
export function fetchLocks(fromBlock = 0) {
  if (!cfg.ethLock) throw new Error("VEIL_ETH_LOCK unset — deploy VeilEthLock first (7f)");
  const out = cast([
    "logs", LOCKED_SIG,
    "--address", cfg.ethLock,
    "--from-block", String(fromBlock),
    "--rpc-url", cfg.sepoliaRpc,
    "--json",
  ]);
  return decodeLockedLogs(out);
}

/** Mirror one lock into the Soroban pool. Idempotent: a re-attest ("already attested") is a no-op. */
export function attest({ commitment, amount }) {
  if (!cfg.poolV3) throw new Error("VEIL_POOL_V3 unset — deploy the v3 veil-pool first (7f)");
  const args = [
    "contract", "invoke", "--send=yes",
    "--network", cfg.network, "--source", cfg.relayerSource,
    "--id", cfg.poolV3, "--",
    "attest_lock", "--commitment", commitment.toString(), "--amount", amount.toString(),
  ];
  try {
    execFileSync("stellar", args, { encoding: "utf8" });
    console.log(`✓ attested commitment ${commitment} (amount ${amount}) → pool ${cfg.poolV3}`);
    return "attested";
  } catch (e) {
    const msg = String(e.stdout || "") + String(e.stderr || "") + String(e.message || "");
    if (/already attested/.test(msg)) {
      console.log(`• commitment ${commitment} already attested; skipping`);
      return "skipped";
    }
    throw e;
  }
}

async function once(fromBlock) {
  const locks = fetchLocks(fromBlock);
  console.log(`found ${locks.length} lock(s) since block ${fromBlock}`);
  for (const l of locks) attest(l);
  return locks.length;
}

async function watch(fromBlock) {
  console.log("eth-lock relayer watching VeilEthLock", cfg.ethLock, "→ veil-pool", cfg.poolV3);
  for (;;) {
    try {
      await once(fromBlock);
    } catch (e) {
      console.error("relayer error (continuing):", e.message);
    }
    await sleep(POLL_MS);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fbArg = process.argv.find((a) => a.startsWith("--from-block="));
  const fromBlock = fbArg ? Number(fbArg.split("=")[1]) : 0;
  if (process.argv.includes("--watch")) {
    watch(fromBlock);
  } else {
    once(fromBlock).catch((e) => {
      console.error("relayer error:", e.message);
      process.exit(1);
    });
  }
}
