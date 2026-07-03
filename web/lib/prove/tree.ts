// Client-side reconstruction of the veil-pool note tree from public on-chain events. The pool is an
// append-only depth-16 Merkle tree of note commitments; every leaf insert emits an event carrying
// (index, commitment) — Deposit (SAC deposit), AttestLock (Ethereum-backed lock), or Spent (joinsplit
// output). An indexer replays those, rebuilds the tree with the same Poseidon2 `compress` the contract
// uses, and derives the Merkle path a borrow proof needs — all on-device, no server, no secrets.
import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { compress } from "./poseidon2";
import { ZERO_LEVELS } from "./zeroes";

/** Merkle depth of the veil-pool note tree (matches circom `MerkleProof(16)` + on-chain `levels=16`). */
export const TREE_DEPTH = 16;
const MAX_LEAVES = 1 << TREE_DEPTH;

/** A single leaf insertion observed on-chain. */
export interface LeafEvent {
  index: number;
  commitment: bigint;
}

/** A note's position in the pool tree: index, sibling path (depth-16), and the root it proves against. */
export interface MerklePath {
  leafIndex: number;
  pathElements: bigint[]; // length TREE_DEPTH
  root: bigint;
}

/**
 * Collapse observed leaf events into the dense `leaves[i] = commitment` array the tree is built from.
 * Throws on a conflicting commitment for an index, or on a HOLE — an index in `[0, max]` with no
 * observed commitment. The only source of a hole is `seize`, which inserts a change leaf at `index+1`
 * without emitting its commitment; rather than silently compute a wrong root, we surface it so the
 * caller can fall back (e.g. read the tree straight from the contract).
 */
export function indexLeaves(events: LeafEvent[]): bigint[] {
  if (events.length === 0) return [];
  let max = 0;
  for (const e of events) {
    if (e.index < 0 || e.index >= MAX_LEAVES) throw new Error(`leaf index ${e.index} out of range`);
    if (e.index > max) max = e.index;
  }
  const arr = new Array<bigint | undefined>(max + 1);
  for (const e of events) {
    const prev = arr[e.index];
    if (prev !== undefined && prev !== e.commitment) {
      throw new Error(`conflicting commitment observed at leaf ${e.index}`);
    }
    arr[e.index] = e.commitment;
  }
  const holes: number[] = [];
  for (let i = 0; i <= max; i++) if (arr[i] === undefined) holes.push(i);
  if (holes.length) {
    throw new Error(
      `tree reconstruction incomplete: leaves [${holes.join(", ")}] have no observed commitment ` +
        `(unindexable seize change-leaf?) — cannot rebuild a trustworthy path`,
    );
  }
  return arr as bigint[];
}

/**
 * Build the Merkle path + root for `leafIndex` over a dense `leaves` array, treating every position
 * past the filled prefix as the empty-subtree zero at that level (`ZERO_LEVELS`). Runs in
 * O(leaves · depth) `compress` calls — it never materializes the full 2^16-leaf tree.
 */
export function buildMerklePath(leaves: bigint[], leafIndex: number): MerklePath {
  if (leafIndex < 0 || leafIndex >= MAX_LEAVES) throw new Error(`leafIndex ${leafIndex} out of range`);
  if (leaves.length > MAX_LEAVES) throw new Error(`too many leaves: ${leaves.length} > ${MAX_LEAVES}`);
  if (leafIndex >= leaves.length) throw new Error(`leafIndex ${leafIndex} beyond ${leaves.length} known leaves`);

  const pathElements: bigint[] = [];
  let level = leaves;
  let idx = leafIndex;
  for (let d = 0; d < TREE_DEPTH; d++) {
    const sibling = idx ^ 1;
    pathElements.push(sibling < level.length ? level[sibling] : ZERO_LEVELS[d]);
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const right = i + 1 < level.length ? level[i + 1] : ZERO_LEVELS[d];
      next.push(compress(level[i], right));
    }
    level = next;
    idx >>= 1;
  }
  const root = level.length ? level[0] : ZERO_LEVELS[TREE_DEPTH];
  return { leafIndex, pathElements, root };
}

/** Root of the tree defined by `leaves` (empty positions = zero subtrees). */
export function computeRoot(leaves: bigint[]): bigint {
  return buildMerklePath(leaves.length ? leaves : [ZERO_LEVELS[0]], 0).root;
}

/**
 * Locate `commitment` among `events` and return its Merkle path. `wantIndex` disambiguates when the
 * same commitment appears twice (it shouldn't for well-formed notes, but a blinding collision is not
 * structurally forbidden).
 */
export function pathForCommitment(
  events: LeafEvent[],
  commitment: bigint,
  wantIndex?: number,
): MerklePath {
  const leaves = indexLeaves(events);
  let idx = wantIndex;
  if (idx === undefined) {
    idx = leaves.findIndex((c) => c === commitment);
    if (idx < 0) throw new Error("commitment not found among observed leaves");
  } else if (leaves[idx] !== commitment) {
    throw new Error(`leaf ${idx} is not the expected commitment`);
  }
  return buildMerklePath(leaves, idx);
}

// ---- live on-chain indexing ----

/**
 * Decode one veil-pool event into a leaf insertion, or `null` if it carries no leaf. Soroban's
 * `#[contractevent]` (SDK 27, confirmed against the soroban-sdk event test) serializes the data as a
 * symbol-keyed MAP (even for a single non-topic field) and puts the event name in `topic[0]`; so the
 * commitment is the map's `commitment` field, and the index is a u32 topic (Deposit/AttestLock) or the
 * map's `index` field (Spent, whose only topic is the U256 nullifier). We match on field name + type,
 * not position, so a non-leaf event can't be mis-read. (The bare-U256 branch is a defensive fallback
 * for a single-value data format; the current contract never emits it.)
 */
// Soroban's `#[contractevent]` macro emits the struct name as a SNAKE_CASE topic symbol — the pool's
// `Deposit`/`AttestLock`/`Spent` structs publish as `deposit`/`attest_lock`/`spent` (verified live on
// the pool: the only leaf topic emitted is `attest_lock`). Matching the PascalCase struct names here
// silently rejected every leaf, so the reconstructed tree was always empty.
const LEAF_EVENTS = new Set(["deposit", "attest_lock", "spent"]);

export function decodeLeafEvent(topics: xdr.ScVal[], data: xdr.ScVal): LeafEvent | null {
  // topic[0] is the event-name symbol; only the three leaf-inserting events can yield a leaf, so a
  // non-leaf (or future) event can never be mis-decoded into a phantom leaf.
  if (topics.length === 0 || topics[0].switch().name !== "scvSymbol") return null;
  if (!LEAF_EVENTS.has(String(scValToNative(topics[0])))) return null;

  let commitment: bigint | undefined;
  let index: number | undefined;

  if (data.switch().name === "scvMap") {
    for (const entry of data.map() ?? []) {
      const key = String(scValToNative(entry.key()));
      const val = entry.val();
      if (key === "commitment" && val.switch().name === "scvU256") {
        commitment = scValToNative(val) as bigint;
      } else if (key === "index" && val.switch().name === "scvU32") {
        index = Number(scValToNative(val));
      }
    }
  } else if (data.switch().name === "scvU256") {
    commitment = scValToNative(data) as bigint; // defensive fallback (single-value data format)
  }

  if (index === undefined) {
    // A u32 topic is the leaf index (Deposit/AttestLock); a U256 topic is a nullifier — ignore it.
    for (const t of topics) {
      if (t.switch().name === "scvU32") { index = Number(scValToNative(t)); break; }
    }
  }

  if (commitment === undefined || index === undefined) return null;
  return { index, commitment };
}

/**
 * Page every leaf-insertion event the pool emitted from `startLedger` onward and decode them.
 * `startLedger` must be within the RPC's event-retention window (≈7 days on testnet); pass the
 * ledger the pool was deployed at (or `latest − window`) to catch the whole tree.
 */
export async function fetchLeafEvents(
  server: rpc.Server,
  poolContractId: string,
  startLedger: number,
  pageLimit = 200,
): Promise<LeafEvent[]> {
  const out: LeafEvent[] = [];
  let cursor: string | undefined;
  // Soroban `getEvents` returns BOUNDED pages — each call scans only a fixed ledger span from its start,
  // so a short OR empty page does NOT mean "no more events": a recent leaf can sit many spans ahead of
  // `startLedger`. Follow the cursor forward until it stops advancing (the RPC returns the same cursor
  // once the tip is reached). The old `break on events.length < pageLimit` bailed on the first empty
  // span, silently returning an empty/partial tree — which broke every Merkle-path rebuild (attest
  // detection, borrow, release). The 64-page cap (≈ tens of days of ledgers) is a safety backstop.
  for (let i = 0; i < 64; i++) {
    const page = await server.getEvents({
      ...(cursor ? { cursor } : { startLedger }),
      filters: [{ type: "contract", contractIds: [poolContractId] }],
      limit: pageLimit,
    });
    for (const ev of page.events) {
      const leaf = decodeLeafEvent(ev.topic, ev.value);
      if (leaf) out.push(leaf);
    }
    if (!page.cursor || page.cursor === cursor) break; // tip reached: cursor no longer advances
    cursor = page.cursor;
  }
  return out;
}
