/**
 * Server-only proving backend for Veil. Turns a user's lock (hashlock H + escrow)
 * into a REAL RISC Zero Groth16 proof the Soroban vault verifies, by:
 *
 *   1. deriving the bound amount slot  = keccak256(abi.encode(H, 0)) + 1  (matches the guest),
 *   2. fetching a live `eth_getProof(escrow, [slot], block)` on Sepolia,
 *   3. transforming the RPC result into the EXACT fixture + meta JSON the host deserializes,
 *   4. ensuring the vault has a checkpoint for that block (admin-posted; DISCLOSED trust),
 *   5. dispatching the `prove.yml` GitHub Actions workflow with the fixture as inputs,
 *   6. (status side) polling the run and parsing the uploaded proof.json for {seal, journal}.
 *
 * Prover-agnostic boundary: `dispatchProof` + `runStatus` are the only two functions that
 * talk to CI. Swap their bodies for a Bonsai call or a rented prover box and the API contract
 * (a job id in, {state, seal, journal} out) is unchanged.
 *
 * This runs ONLY where `gh` (authed) and the Stellar admin key live: locally or a keyed host.
 * On a stock serverless host (no gh, no admin key) every function reports `unavailable` with a
 * plain reason and NEVER fabricates a proof. See web/PROVING.md.
 */
import { execFile } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  encodeAbiParameters,
  keccak256,
  toHex,
  hexToBigInt,
  createPublicClient,
  http,
} from "viem";
import { sepolia } from "viem/chains";
import { ESCROW, VAULT, sepoliaRpc } from "@/lib/onchain";
import { readCheckpoint } from "@/lib/server/soroban";

const run = promisify(execFile);

/** Repo whose prove.yml we dispatch. Override with GITHUB_REPO. */
const REPO = process.env.GITHUB_REPO || "dmustapha/veil";
/** Stellar CLI identity that is the vault admin (the only one that may post checkpoints). */
const ADMIN_SOURCE = process.env.STELLAR_ADMIN_SOURCE || "veil-spike";
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
/** Confirmations to wait behind chain head before proving (avoids reorg of the proven root). */
const CONFIRMATIONS = Number(process.env.PROVE_CONFIRMATIONS || 6);

/** A clear, surfaced reason the backend cannot run here (missing host, key, or tool). */
export class Unavailable extends Error {}

/**
 * Job-token auth for /api/prove/status. GitHub run ids are short, sequential, and guessable, so
 * an unauthenticated status endpoint lets anyone harvest a real {seal, journal} (a bearer proof)
 * by polling adjacent ids. We never return the raw run id to the client; we return an
 * HMAC-signed token, and status only unwraps a token whose MAC verifies — so only the caller who
 * started the proof (and was handed the token by POST /api/prove) can poll it.
 *
 * Secret from PROVE_TOKEN_SECRET on the keyed host; otherwise a per-process random secret (the
 * backend is a single long-lived process — proving 503s on stock serverless before reaching here).
 */
const TOKEN_SECRET = process.env.PROVE_TOKEN_SECRET || randomBytes(32).toString("hex");
function signRunId(runId: string): string {
  const mac = createHmac("sha256", TOKEN_SECRET).update(runId).digest("base64url");
  return `${runId}.${mac}`;
}
/** Verify a job token and return its run id, or null if the MAC does not check out. */
function runIdFromToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const runId = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(
    createHmac("sha256", TOKEN_SECRET).update(runId).digest("base64url")
  );
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return runId;
}

const isHex32 = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

/** keccak256(abi.encode(bytes32 H, uint256 0)) + 1 - the bound `locks[H].amount` slot. */
export function amountSlot(h: string): `0x${string}` {
  const enc = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }],
    [h as `0x${string}`, 0n]
  );
  const base = hexToBigInt(keccak256(enc));
  return toHex(base + 1n, { size: 32 });
}

type RawProof = {
  address: string;
  accountProof: string[];
  balance: string;
  codeHash: string;
  nonce: string;
  storageHash: string;
  storageProof: { key: string; value: string; proof: string[] }[];
};
type RawBlock = { number: string; hash: string; stateRoot: string };

export type Fixture = { fixture: RawProof; meta: Record<string, unknown>; block: number; stateRoot: string };

/** Wrap a raw eth_getProof JSON-RPC result + block into the host's fixture + meta shape. */
export async function buildFixture(
  h: string,
  escrow: string = ESCROW,
  blockOverride?: number
): Promise<Fixture> {
  if (!isHex32(h)) throw new Error("hashlock must be 0x + 64 hex chars");
  const client = createPublicClient({ chain: sepolia, transport: http(sepoliaRpc()) });
  const slot = amountSlot(h);

  let block: bigint;
  if (blockOverride && blockOverride > 0) {
    block = BigInt(blockOverride);
  } else {
    const head = await client.getBlockNumber();
    block = head - BigInt(CONFIRMATIONS);
  }
  const blockHex = toHex(block);

  const blk = (await client.request({
    method: "eth_getBlockByNumber" as never,
    params: [blockHex, false] as never,
  })) as unknown as RawBlock;

  // Raw RPC (NOT viem's typed getProof) so values stay as the hex strings the host parses.
  const proof = (await client.request({
    method: "eth_getProof" as never,
    params: [escrow, [slot], blockHex] as never,
  })) as unknown as RawProof;

  const sp = proof.storageProof?.[0];
  if (!sp) throw new Error("eth_getProof returned no storage proof");
  const value = BigInt(sp.value === "0x" ? "0x0" : sp.value);
  if (value === 0n) {
    throw new Error(
      `No collateral is locked under this hashlock at block ${block} (slot value is 0). Lock first, then borrow.`
    );
  }

  const meta = {
    escrow,
    hashlock: h,
    amount_slot: slot,
    pinned_block: Number(block),
    state_root: blk.stateRoot,
    block_hash: blk.hash,
    storage_value: sp.value,
    storage_hash: proof.storageHash,
    account_proof_nodes: proof.accountProof.length,
    storage_proof_nodes: sp.proof.length,
  };
  return { fixture: proof, meta, block: Number(block), stateRoot: blk.stateRoot };
}

/** ENOENT (tool missing) -> Unavailable; everything else -> a SANITIZED error. */
async function tool(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(cmd, args, { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      throw new Unavailable(`\`${cmd}\` is not installed on this host`);
    }
    // PRIVACY: never surface the invoked command line. execFile's default error
    // message is "Command failed: <cmd + all args>", and our args carry the
    // base64 eth_getProof fixture + meta whose storage_value IS the private
    // collateral amount. Echo only the tool name and its stderr (no args, no
    // secrets), trimmed — so a failed prove can never leak the amount it hides.
    const stderr = (err.stderr ?? "").toString().trim().slice(0, 200);
    throw new Error(`\`${cmd}\` failed${stderr ? `: ${stderr}` : ""}`);
  }
}

/**
 * DISCLOSED TRUST. Ensure the vault has a checkpoint for `block`. If absent (or different), the
 * admin identity posts (block, state_root). A real borrow against this block fails with
 * UnknownCheckpoint until this lands, so we post before dispatching the proof.
 */
export async function ensureCheckpoint(block: number, stateRoot: string): Promise<{ existed: boolean }> {
  let existing: string | null = null;
  try {
    existing = await readCheckpoint(block);
  } catch {
    existing = null; // RPC flaky: fall through to a (idempotent) post.
  }
  if (existing && existing.toLowerCase() === stateRoot.toLowerCase()) {
    return { existed: true };
  }
  await tool("stellar", [
    "contract",
    "invoke",
    "--send=yes",
    "--network",
    STELLAR_NETWORK,
    "--source",
    ADMIN_SOURCE,
    "--id",
    VAULT,
    "--",
    "post_checkpoint",
    "--block",
    String(block),
    "--state_root",
    stateRoot.replace(/^0x/, ""),
  ]);
  return { existed: false };
}

/**
 * Dispatch the prove.yml workflow with the user's fixture as base64 inputs, then resolve the
 * created run id (gh does not return it). Time-correlated: the newest workflow_dispatch run
 * created at/after our dispatch is ours.
 */
export async function dispatchProof(fx: Fixture): Promise<string> {
  const fixture_b64 = Buffer.from(JSON.stringify(fx.fixture)).toString("base64");
  const meta_b64 = Buffer.from(JSON.stringify(fx.meta)).toString("base64");
  const since = Date.now() - 10_000; // slack for clock skew / queue lag

  await tool("gh", [
    "workflow",
    "run",
    "prove.yml",
    "--repo",
    REPO,
    "-f",
    `fixture_b64=${fixture_b64}`,
    "-f",
    `meta_b64=${meta_b64}`,
  ]);

  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const out = await tool("gh", [
      "run",
      "list",
      "--repo",
      REPO,
      "--workflow=prove.yml",
      "--event=workflow_dispatch",
      "--json",
      "databaseId,createdAt",
      "--limit",
      "10",
    ]);
    const runs = JSON.parse(out) as { databaseId: number; createdAt: string }[];
    const mine = runs
      .filter((r) => new Date(r.createdAt).getTime() >= since)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    // Hand the client an HMAC-signed token, never the raw (guessable) run id — see runIdFromToken.
    if (mine) return signRunId(String(mine.databaseId));
  }
  throw new Error("workflow dispatched but its run id could not be resolved yet");
}

export type ProveStatus =
  | { state: "pending"; message?: string }
  | { state: "ready"; seal: string; journal: string }
  | { state: "error"; message: string };

/** Poll a run; on success download veil-proof and parse {seal, journal} from proof.json. */
export async function runStatus(token: string): Promise<ProveStatus> {
  // AUTH: only a token whose HMAC verifies maps to a real run id. A guessed/forged id is rejected
  // here, so the {seal, journal} cannot be harvested by polling sequential GitHub run ids.
  const id = runIdFromToken(token);
  if (!id) return { state: "error", message: "invalid or unauthorized proof job id" };

  let info: { status: string; conclusion: string | null; url: string };
  try {
    const out = await tool("gh", [
      "run",
      "view",
      id,
      "--repo",
      REPO,
      "--json",
      "status,conclusion,url",
    ]);
    info = JSON.parse(out);
  } catch (e) {
    if (e instanceof Unavailable) return { state: "error", message: `Proving backend unavailable: ${e.message}` };
    return { state: "error", message: "Could not read the proving run status." };
  }

  if (info.status !== "completed") {
    return {
      state: "pending",
      message: `Generating the Groth16 proof off-chain. This takes several minutes.`,
    };
  }
  if (info.conclusion !== "success") {
    return { state: "error", message: `Proving failed (${info.conclusion ?? "unknown"}). See ${info.url}` };
  }

  const dir = await mkdtemp(join(tmpdir(), "veil-proof-"));
  try {
    await tool("gh", ["run", "download", id, "--repo", REPO, "-n", "veil-proof", "--dir", dir]);
    const raw = await readFile(join(dir, "proof.json"), "utf8");
    const proof = JSON.parse(raw) as { seal?: string; journal?: string };
    if (!proof.seal || !proof.journal) {
      return { state: "error", message: "proof.json is missing seal or journal." };
    }
    return { state: "ready", seal: proof.seal, journal: proof.journal };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "artifact download failed";
    return { state: "error", message: `Could not download the proof artifact: ${msg}` };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
