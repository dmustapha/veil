// CSPRNG note generation + store. Confirms every derived value (spendPk, both commitments) matches the
// same Poseidon2 primitives the circuits use, the secrets are uniform canonical field elements, and the
// witness converters feed the lock/borrow provers the exact openings behind the committed identities.
import { describe, expect, it } from "vitest";
import { hash2, P } from "../prove/poseidon2";
import { DS_NOTE_AVAILABLE, DS_NOTE_LOCKED, noteCommitment, spendPkFromNk } from "../prove/notes";
import {
  createNote, getNote, isVaultUnlocked, loadNotes, lockVault, randomFieldElement,
  saveNote, toBorrowNote, toLockNote, toReleaseNote, unlockVault, updateNote,
} from "./notes";

describe("randomFieldElement", () => {
  it("returns distinct canonical field elements in [1, P)", () => {
    const seen = new Set<bigint>();
    for (let i = 0; i < 256; i++) {
      const v = randomFieldElement();
      expect(v).toBeGreaterThan(0n);
      expect(v).toBeLessThan(P);
      seen.add(v);
    }
    expect(seen.size).toBe(256); // no collisions → genuine entropy, not a constant
  });
});

describe("createNote", () => {
  const n = createNote(2_000_000_000_000_000n);

  it("derives spendPk = H1(nk, DS_NK)", () => {
    expect(BigInt(n.spendPk)).toBe(spendPkFromNk(BigInt(n.nk)));
  });

  it("AVAILABLE commitment matches its opening", () => {
    expect(BigInt(n.commitmentAvailable)).toBe(
      noteCommitment(DS_NOTE_AVAILABLE, BigInt(n.amount), BigInt(n.spendPk), BigInt(n.blindingIn), 0n),
    );
  });

  it("LOCKED commitment matches its opening", () => {
    expect(BigInt(n.commitmentLocked)).toBe(
      noteCommitment(DS_NOTE_LOCKED, BigInt(n.amount), BigInt(n.spendPk), BigInt(n.blindingOut), BigInt(n.lockId)),
    );
  });

  it("every secret is a canonical field element and blindings differ", () => {
    for (const f of [n.nk, n.blindingIn, n.blindingOut, n.loanSecret, n.lockId, n.spendPk]) {
      const v = BigInt(f);
      expect(v).toBeGreaterThan(0n);
      expect(v).toBeLessThan(P);
    }
    expect(n.blindingIn).not.toBe(n.blindingOut);
  });

  it("uses fresh entropy per note (audit M-01 — no shared/guessable secrets)", () => {
    expect(createNote(1n).nk).not.toBe(createNote(1n).nk);
  });

  it("starts in 'created' and rejects out-of-range amounts", () => {
    expect(n.status).toBe("created");
    expect(() => createNote(0n)).toThrow();
    expect(() => createNote(1n << 128n)).toThrow();
  });

  it("derives lockId = Poseidon2(C0, r, 0x35) — B1′ binding", () => {
    const note = createNote(1000n);
    const expected = hash2(BigInt(note.commitmentAvailable), BigInt(note.r!), 0x35n);
    expect(BigInt(note.lockId)).toBe(expected);
  });

  it("r is a non-zero canonical field element", () => {
    const note = createNote(1000n);
    const r = BigInt(note.r!);
    expect(r).toBeGreaterThan(0n);
    expect(r).toBeLessThan(P);
  });
});

describe("witness converters", () => {
  const n = createNote(1234n);

  it("toLockNote carries the AVAILABLE opening behind commitmentAvailable", () => {
    const l = toLockNote(n);
    expect(l.spendPk).toBe(spendPkFromNk(l.nk));
    expect(noteCommitment(DS_NOTE_AVAILABLE, l.amount, l.spendPk, l.blindingIn, 0n)).toBe(
      BigInt(n.commitmentAvailable),
    );
  });

  it("toLockNote passes r through for the B1′ circuit constraint", () => {
    const l = toLockNote(n);
    expect(l.r).toBe(BigInt(n.r!));
    // The circuit will enforce lockId = hash2(C0, r, 0x35); verify that binding holds in the adapter too.
    expect(hash2(BigInt(n.commitmentAvailable), l.r, 0x35n)).toBe(l.lockId);
  });

  it("toBorrowNote carries the LOCKED opening behind commitmentLocked", () => {
    const b = toBorrowNote(n);
    expect(noteCommitment(DS_NOTE_LOCKED, b.amount, b.spendPk, b.blinding, b.lockId)).toBe(
      BigInt(n.commitmentLocked),
    );
  });

  it("toReleaseNote exposes the LOCKED note opening + r for the release_repaid circuit", () => {
    const rel = toReleaseNote(n);
    expect(rel.amount).toBe(BigInt(n.amount));
    expect(rel.blindingOut).toBe(BigInt(n.blindingOut));
    expect(rel.spendPk).toBe(BigInt(n.spendPk));
    expect(rel.nk).toBe(BigInt(n.nk));
    expect(rel.lockId).toBe(BigInt(n.lockId));
    expect(rel.r).toBe(BigInt(n.r!));
  });

  it("toLockNote throws a clear error for pre-B1′ notes missing r (backward-compat guard)", () => {
    const base = createNote(1234n);
    const { r: _r, ...noteWithoutR } = base as Required<typeof base>;
    expect(() => toLockNote(noteWithoutR as typeof base)).toThrow(
      /predates the B1′ collateral-binding upgrade/,
    );
  });
});

describe("note store (encrypted, audit M-01)", () => {
  it("is empty and write-blocked while locked", async () => {
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
    expect(await loadNotes()).toEqual([]);
    await expect(saveNote(createNote(1n))).rejects.toThrow(/locked/);
  });

  it("saves, reads back, and patches a note once unlocked", async () => {
    await unlockVault("correct horse battery staple");
    const n = createNote(999n);
    await saveNote(n);
    expect((await getNote(n.commitmentAvailable))?.nk).toBe(n.nk);
    await updateNote(n.commitmentAvailable, { status: "attested", availableLeafIndex: 3 });
    const g = await getNote(n.commitmentAvailable);
    expect(g?.status).toBe("attested");
    expect(g?.availableLeafIndex).toBe(3);
  });

  it("dedups by AVAILABLE commitment", async () => {
    await unlockVault("correct horse battery staple");
    const n = createNote(555n);
    await saveNote(n);
    await saveNote({ ...n, status: "locked-eth" });
    expect((await loadNotes()).filter((x) => x.commitmentAvailable === n.commitmentAvailable)).toHaveLength(1);
  });

  it("rejects the wrong passphrase against an existing store", async () => {
    await unlockVault("correct horse battery staple");
    await saveNote(createNote(42n));
    lockVault();
    await expect(unlockVault("wrong passphrase")).rejects.toThrow(/incorrect/);
  });
});
