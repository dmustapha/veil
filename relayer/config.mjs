// Veil relayer shared config + helpers. Reads contracts/escrow/.env for the Sepolia RPC + key,
// and holds the live testnet addresses. Soroban/Ethereum calls shell out to the stellar/cast CLIs
// (already configured with the `veil-spike` identity), which keeps the relayers thin and reliable.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
  return env;
}

const escrowEnv = loadEnv(join(here, "../contracts/escrow/.env"));

export const cfg = {
  // Ethereum (Sepolia)
  sepoliaRpc: process.env.SEPOLIA_RPC_URL || escrowEnv.SEPOLIA_RPC_URL,
  ethKey: process.env.PRIVATE_KEY || escrowEnv.PRIVATE_KEY,
  escrow: escrowEnv.ESCROW_ADDRESS || "0xb833ffEc3C1a3A0aB71a9c014fD174bA7F1eBd6F",
  // Stellar (Soroban testnet)
  network: "testnet",
  stellarSource: "veil-spike",
  // CURRENT hardened vault (post-debug). Prior CBK7UNIO/CAV46LV5 instances are superseded.
  vault: "CBICAWGA2HGZQIFQOY27DYMXXGCA6OMNAE5G77Z2T7N7DOMTLYWVGILV",
};

export function cast(args) {
  return execFileSync("cast", args, { encoding: "utf8" }).trim();
}

// Invoke a Soroban contract function via the stellar CLI. `send` true = real tx, false = simulate.
export function stellar(id, fnAndArgs, { send = true } = {}) {
  const args = [
    "contract", "invoke",
    send ? "--send=yes" : "--send=no",
    "--network", cfg.network,
    "--source", cfg.stellarSource,
    "--id", id, "--",
    ...fnAndArgs,
  ];
  return execFileSync("stellar", args, { encoding: "utf8" }).trim();
}

export function sepoliaStateRoot(blockTag) {
  const out = cast(["block", String(blockTag), "--rpc-url", cfg.sepoliaRpc, "--json"]);
  const b = JSON.parse(out);
  return { block: parseInt(b.number, 16), stateRoot: b.stateRoot, hash: b.hash };
}

export function sepoliaLatest() {
  return parseInt(cast(["block-number", "--rpc-url", cfg.sepoliaRpc]), 10);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
