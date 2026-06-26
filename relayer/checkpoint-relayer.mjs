// Veil checkpoint relayer (DISCLOSED TRUST).
//
// Posts canonical Ethereum (Sepolia) state roots to the Soroban vault so the vault can bind a
// proof to a known Ethereum state. This is the single trusted component we disclose plainly: a
// ZK light client replaces it in future work. It cannot forge the proof — it only attests "this
// (block, state_root) is canonical." A wrong root makes every proof against it fail to verify.
//
//   node checkpoint-relayer.mjs              # one-shot: post the latest confirmed root
//   node checkpoint-relayer.mjs --watch      # poll and post on each new confirmed block
//   node checkpoint-relayer.mjs --block N     # post a specific block's root (e.g. a pinned demo block)
import { cfg, stellar, sepoliaStateRoot, sepoliaLatest, sleep } from "./config.mjs";

const CONFIRMATIONS = 3;
const POLL_MS = 15_000;

function post(block, stateRoot) {
  const root = stateRoot.replace(/^0x/, "");
  stellar(cfg.vault, ["post_checkpoint", "--block", String(block), "--state_root", root]);
  console.log(`✓ posted checkpoint block=${block} state_root=${stateRoot}`);
}

async function once() {
  const target = sepoliaLatest() - CONFIRMATIONS;
  const { block, stateRoot } = sepoliaStateRoot(target);
  post(block, stateRoot);
}

async function watch() {
  console.log("checkpoint relayer watching Sepolia → vault", cfg.vault);
  let last = 0;
  for (;;) {
    try {
      const target = sepoliaLatest() - CONFIRMATIONS;
      if (target > last) {
        const { block, stateRoot } = sepoliaStateRoot(target);
        post(block, stateRoot);
        last = target;
      }
    } catch (e) {
      console.error("relayer error (continuing):", e.message);
    }
    await sleep(POLL_MS);
  }
}

const args = process.argv.slice(2);
if (args.includes("--watch")) {
  watch();
} else if (args.includes("--block")) {
  const n = Number(args[args.indexOf("--block") + 1]);
  const { block, stateRoot } = sepoliaStateRoot(n);
  post(block, stateRoot);
} else {
  once();
}
