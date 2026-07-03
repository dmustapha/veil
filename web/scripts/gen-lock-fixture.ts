// Recompute circom/lock_input.json for B1': set lockId = Poseidon2(C0, r, 0x35), add r.
// NOTE: poseidon2.ts exports `hash2` (not `poseidon2Hash2`) — confirmed from source.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash2 } from "@/lib/prove/poseidon2";
import { noteCommitment } from "@/lib/prove/notes";

const DS_NOTE_AVAILABLE = 0x10n;
const DS_LOCKBIND = 0x35n;
const path = resolve(__dirname, "../../circom/lock_input.json");
const inp = JSON.parse(readFileSync(path, "utf8"));

const amount = BigInt(inp.amount);
const spendPk = BigInt(inp.spendPk);
const blindingIn = BigInt(inp.blindingIn);

// C0 = NoteCommitment(0x10, amount, spendPk, blindingIn, aux=0) — the AVAILABLE input note (cin.out).
const c0 = noteCommitment(DS_NOTE_AVAILABLE, amount, spendPk, blindingIn, 0n);

// Deterministic non-zero r (canonical field element) for a reproducible fixture.
const r = 0x0d1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f70n;
const lockId = hash2(c0, r, DS_LOCKBIND);

inp.r = r.toString();
inp.lockId = lockId.toString();
writeFileSync(path, JSON.stringify(inp, null, 2) + "\n");
console.log("lock_input.json updated: C0=%s lockId=%s", c0.toString(), lockId.toString());
