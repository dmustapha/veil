"use client";

/**
 * Device-local shielded notes for Veil v3. A note's secret opening — nullifier key, blindings, loan
 * secret, lock id — is drawn from a CSPRNG on THIS device and never leaves it (audit M-01: the Phase-6d
 * demo used guessable constants like nk=5, which would let an observer brute-force a note off its
 * on-chain commitment). Only derived public values (the commitments, and later the Groth16 proofs)
 * ever go on-chain. The whole lifecycle is: create → lock WETH on Ethereum (bound to the AVAILABLE
 * commitment) → attested into the pool → lock note (AVAILABLE→LOCKED) → borrow against the LOCKED note.
 */
import { hash2, P } from "../prove/poseidon2";
import { DS_NOTE_AVAILABLE, DS_NOTE_LOCKED, noteCommitment, spendPkFromNk } from "../prove/notes";
import type { LockNote } from "../prove/lock";
import type { Note as BorrowNote } from "../prove/witness";
import { b64ToBytes, bytesToB64, decryptWithKey, deriveKey, encryptWithKey, randomSalt } from "./vault";

/**
 * A uniform CSPRNG field element in `[1, P)`. Samples 254 random bits (P < 2^254, so ≈76% acceptance)
 * and rejection-samples to avoid modulo bias; rejects 0 (a degenerate key/blinding). Uses Web Crypto,
 * available in the browser and in Node ≥20.
 */
export function randomFieldElement(): bigint {
  const buf = new Uint8Array(32);
  for (;;) {
    crypto.getRandomValues(buf);
    buf[0] &= 0x3f; // clamp to 254 bits (P < 2^254) — bounded rejection, no modulo bias
    let v = 0n;
    for (const b of buf) v = (v << 8n) | BigInt(b);
    if (v !== 0n && v < P) return v;
  }
}

/** Where a note is in its lifecycle (drives the UI and which action is next). */
export type NoteStatus =
  | "created" // secrets drawn; nothing on-chain yet
  | "locked-eth" // WETH escrowed on Sepolia against the AVAILABLE commitment
  | "attested" // Axelar-attested into the pool; AVAILABLE leaf known
  | "locked-note" // spent AVAILABLE → minted LOCKED note in the pool
  | "borrowed" // borrowed USDC against the LOCKED note
  | "repaid" // loan repaid; WETH escrow eligible for release
  | "released"; // WETH escrow released back to borrower on Ethereum

/**
 * One shielded note across its whole life. The `*` secret fields are the private witness for the lock
 * and borrow circuits; the two commitments are the note's public identities in the pool (AVAILABLE
 * before locking, LOCKED after). All big integers are decimal strings so the record is JSON/localStorage
 * safe.
 */
export interface VeilNote {
  // --- opening secrets (device-local; NEVER transmitted) ---
  amount: string; // WETH wei locked on Ethereum (also the hidden collateral)
  nk: string; // nullifier key
  spendPk: string; // = H1(nk, DS_NK) — bound into both commitments
  blindingIn: string; // AVAILABLE-note blinding
  blindingOut: string; // LOCKED-note blinding (fresh, distinct)
  loanSecret: string; // → positionId at borrow
  r?: string; // B1′ binding random: lockId = Poseidon2(C0, r, DS_LOCKBIND=0x35) — optional for pre-B1′ notes
  lockId: string; // → lockHandle; the LOCKED note's aux (derived from C0 + r, NOT random)
  // --- public identities ---
  commitmentAvailable: string; // NoteCommitment(0x10, amount, spendPk, blindingIn, 0)
  commitmentLocked: string; // NoteCommitment(0x11, amount, spendPk, blindingOut, lockId)
  // --- lifecycle ---
  status: NoteStatus;
  createdAt: number;
  lockTxEth?: string; // Sepolia VeilEthLock.lock
  executeTx?: string; // Soroban veil-pool.execute (Axelar attest → AVAILABLE leaf)
  availableLeafIndex?: number;
  lockTx?: string; // Soroban veil-pool.lock (AVAILABLE→LOCKED)
  lockedLeafIndex?: number;
  borrowTx?: string; // veil-vault.borrow
  repayTx?: string; // veil-vault.repay (status: repaid)
  releaseTx?: string; // veil-pool.release_repaid → Axelar reverse-hop tx hash
  releaseEthTx?: string; // Ethereum WETH-release tx hash (status: released)
}

/**
 * Mint a fresh note for `amountWei` of WETH: draw every secret from the CSPRNG, derive `spendPk` and
 * both commitments with the same Poseidon2 primitives the circuits use. Pure except for the RNG + clock.
 */
export function createNote(amountWei: bigint): VeilNote {
  if (amountWei <= 0n || amountWei >= 1n << 128n) throw new Error("amount must be in (0, 2^128)");
  const nk = randomFieldElement();
  const blindingIn = randomFieldElement();
  const blindingOut = randomFieldElement();
  const loanSecret = randomFieldElement();
  const spendPk = spendPkFromNk(nk);
  const commitmentAvailable = noteCommitment(DS_NOTE_AVAILABLE, amountWei, spendPk, blindingIn, 0n);
  // B1′: derive lockId from the AVAILABLE commitment + a fresh binding random `r` (NOT a random lockId).
  // This enforces the C0↔lockId link in both the lock and release_repaid circuits.
  const r = randomFieldElement();
  const lockId = hash2(commitmentAvailable, r, 0x35n); // DS_LOCKBIND = 0x35
  const commitmentLocked = noteCommitment(DS_NOTE_LOCKED, amountWei, spendPk, blindingOut, lockId);
  return {
    amount: amountWei.toString(),
    nk: nk.toString(),
    spendPk: spendPk.toString(),
    blindingIn: blindingIn.toString(),
    blindingOut: blindingOut.toString(),
    loanSecret: loanSecret.toString(),
    r: r.toString(),
    lockId: lockId.toString(),
    commitmentAvailable: commitmentAvailable.toString(),
    commitmentLocked: commitmentLocked.toString(),
    status: "created",
    createdAt: Date.now(),
  };
}

/** The AVAILABLE-note opening as the lock circuit's private witness (bigints). */
export function toLockNote(n: VeilNote): LockNote {
  if (!n.r) throw new Error("This note predates the B1′ collateral-binding upgrade and can no longer be locked/released — please create a new note.");
  return {
    amount: BigInt(n.amount),
    blindingIn: BigInt(n.blindingIn),
    spendPk: BigInt(n.spendPk),
    nk: BigInt(n.nk),
    lockId: BigInt(n.lockId),
    blindingOut: BigInt(n.blindingOut),
    r: BigInt(n.r),
  };
}

/**
 * The private opening needed by the `release_repaid` reverse-leg circuit: proves the LOCKED note C1
 * is in the pool + repaid tree, then re-proves B1′ (lockId = Poseidon2(C0, r)) to bind the release
 * to the original Ethereum escrow. Mirrors `toLockNote` but exposes the LOCKED note's blinding and `r`.
 */
export interface ReleaseNote {
  amount: bigint;
  blindingOut: bigint; // C1 (LOCKED note) blinding — "blindingIn" in the release circuit
  spendPk: bigint;
  nk: bigint;
  lockId: bigint;
  r: bigint; // B1′ binding random (same r drawn at note creation)
}

export function toReleaseNote(n: VeilNote): ReleaseNote {
  if (!n.r) throw new Error("This note predates the B1′ collateral-binding upgrade and can no longer be locked/released — please create a new note.");
  return {
    amount: BigInt(n.amount),
    blindingOut: BigInt(n.blindingOut),
    spendPk: BigInt(n.spendPk),
    nk: BigInt(n.nk),
    lockId: BigInt(n.lockId),
    r: BigInt(n.r),
  };
}

/** The LOCKED-note opening as the borrow circuit's private witness (bigints). */
export function toBorrowNote(n: VeilNote): BorrowNote {
  return {
    amount: BigInt(n.amount),
    blinding: BigInt(n.blindingOut),
    spendPk: BigInt(n.spendPk),
    lockId: BigInt(n.lockId),
    loanSecret: BigInt(n.loanSecret),
  };
}

// ---- device-local ENCRYPTED persistence (audit M-01) ----
// Notes are AES-GCM encrypted at rest under a passphrase-derived key held only in memory for the
// session, so a DOM/localStorage read alone yields ciphertext, not spendable secrets. Unlock once per
// session with `unlockVault(passphrase)`; the store is empty (and writes throw) while locked.

const KEY = "veil.notes.v3"; // base64(iv‖ciphertext) of the notes array
const SALT_KEY = "veil.notes.salt"; // base64 PBKDF2 salt (public)
const mem = new Map<string, string>();
let sessionKey: CryptoKey | null = null;

function store(): Pick<Storage, "getItem" | "setItem"> {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
}

function isValid(x: unknown): x is VeilNote {
  if (!x || typeof x !== "object") return false;
  const n = x as Record<string, unknown>;
  return (
    typeof n.commitmentAvailable === "string" &&
    typeof n.amount === "string" &&
    typeof n.nk === "string" &&
    typeof n.spendPk === "string"
  );
}

/** Whether the note vault is unlocked (a session key is loaded). */
export function isVaultUnlocked(): boolean {
  return sessionKey != null;
}

/**
 * Whether an encrypted notes blob already exists on this device — i.e. a RETURNING user, detectable
 * WITHOUT the passphrase (we only check for ciphertext presence, never decrypt). Lets the unlock gate
 * say "your positions are here, unlock them" instead of reading like first-time setup after a reload.
 */
export function hasStoredNotes(): boolean {
  try {
    return store().getItem(KEY) != null;
  } catch {
    return false;
  }
}

/** Drop the in-memory key (e.g. on sign-out / tab lock). Ciphertext stays at rest. */
export function lockVault(): void {
  sessionKey = null;
}

/**
 * Derive and cache the session key from `passphrase`. If a store already exists, it must decrypt with
 * this passphrase — otherwise this throws "incorrect passphrase" (a fresh salt is minted on first use).
 */
export async function unlockVault(passphrase: string): Promise<void> {
  const s = store();
  const savedSalt = s.getItem(SALT_KEY);
  const salt = savedSalt ? b64ToBytes(savedSalt) : randomSalt();
  if (!savedSalt) s.setItem(SALT_KEY, bytesToB64(salt));
  const key = await deriveKey(passphrase, salt);
  const blob = s.getItem(KEY);
  if (blob) {
    try {
      JSON.parse(await decryptWithKey(key, blob));
    } catch {
      throw new Error("incorrect passphrase");
    }
  }
  sessionKey = key;
}

/** Load and decrypt the notes. Returns `[]` when locked or unreadable (never throws — render-safe). */
export async function loadNotes(): Promise<VeilNote[]> {
  if (!sessionKey) return [];
  try {
    const blob = store().getItem(KEY);
    if (!blob) return [];
    const parsed = JSON.parse(await decryptWithKey(sessionKey, blob));
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

export async function getNote(commitmentAvailable: string): Promise<VeilNote | undefined> {
  return (await loadNotes()).find((n) => n.commitmentAvailable === commitmentAvailable);
}

async function persist(list: VeilNote[]): Promise<void> {
  if (!sessionKey) throw new Error("note vault is locked — call unlockVault(passphrase) first");
  store().setItem(KEY, await encryptWithKey(sessionKey, JSON.stringify(list)));
}

/** Persist a note, replacing any existing entry with the same AVAILABLE commitment. Newest first. */
export async function saveNote(note: VeilNote): Promise<VeilNote[]> {
  const next = [note, ...(await loadNotes()).filter((n) => n.commitmentAvailable !== note.commitmentAvailable)];
  await persist(next);
  return next;
}

/** Delete the note with the given AVAILABLE commitment — e.g. discard an unlocked draft that never
 *  made it on-chain. Safe: only device-local secrets are dropped; nothing was ever committed. */
export async function removeNote(commitmentAvailable: string): Promise<VeilNote[]> {
  const next = (await loadNotes()).filter((n) => n.commitmentAvailable !== commitmentAvailable);
  await persist(next);
  return next;
}

/** Merge a lifecycle patch into the note with the given AVAILABLE commitment. */
export async function updateNote(commitmentAvailable: string, patch: Partial<VeilNote>): Promise<VeilNote[]> {
  const next = (await loadNotes()).map((n) =>
    n.commitmentAvailable === commitmentAvailable ? { ...n, ...patch } : n,
  );
  await persist(next);
  return next;
}
