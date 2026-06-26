// Veil secret-reveal relayer.
//
// When a borrower repays on Stellar, the vault stores the secret `S` (preimage of the hashlock H).
// This relayer picks `S` up and submits it to the Sepolia escrow's `claimRepaid(S)`, which returns
// the collateral to the original depositor. Permissionless: anyone can run it; it only moves the
// collateral along the path the borrower already authorized by repaying.
//
//   node secret-relayer.mjs <hashlockHex>          # watch until the secret appears, then unlock
//   node secret-relayer.mjs <hashlockHex> --once    # single check
import { cfg, cast, stellar, sleep } from "./config.mjs";

const POLL_MS = 5_000;

function getSecret(hashlock) {
  const h = hashlock.replace(/^0x/, "");
  const out = stellar(cfg.vault, ["get_secret", "--hashlock", h], { send: false });
  // returns JSON: null, or a quoted hex string
  const v = JSON.parse(out);
  return v ? "0x" + String(v).replace(/^0x/, "") : null;
}

function unlockOnEthereum(secret) {
  const out = cast([
    "send", cfg.escrow, "claimRepaid(bytes32)", secret,
    "--private-key", cfg.ethKey, "--rpc-url", cfg.sepoliaRpc, "--json",
  ]);
  const r = JSON.parse(out);
  console.log(`✓ Ethereum collateral unlocked. tx=${r.transactionHash} status=${r.status}`);
}

async function main() {
  const hashlock = process.argv[2];
  if (!hashlock) {
    console.error("usage: node secret-relayer.mjs <hashlockHex> [--once]");
    process.exit(1);
  }
  const once = process.argv.includes("--once");
  console.log(`secret relayer watching vault for hashlock ${hashlock}`);
  for (;;) {
    let secret = null;
    try {
      secret = getSecret(hashlock);
    } catch (e) {
      console.error("poll error (continuing):", e.message);
    }
    if (secret) {
      console.log(`secret revealed on Stellar: ${secret}`);
      unlockOnEthereum(secret);
      return;
    }
    if (once) {
      console.log("no secret yet");
      return;
    }
    await sleep(POLL_MS);
  }
}

main();
