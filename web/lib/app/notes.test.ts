// CSPRNG note generation + store. Confirms every derived value (spendPk, both commitments) matches the
// same Poseidon2 primitives the circuits use, the secrets are uniform canonical field elements, and the
// witness converters feed the lock/borrow provers the exact openings behind the committed identities.
import { describe, expect, it } from "vitest";
import { P } from "../prove/poseidon2";
import { DS_NOTE_AVAILABLE, DS_NOTE_LOCKED, noteCommitment, spendPkFromNk } from "../prove/notes";
import {
  createNote, getNote, isVaultUnlocked, loadNotes, lockVault, randomFieldElement,
  saveNote, toBorrowNote, toLockNote, unlockVault, updateNote,
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

  it("toBorrowNote carries the LOCKED opening behind commitmentLocked", () => {
    const b = toBorrowNote(n);
    expect(noteCommitment(DS_NOTE_LOCKED, b.amount, b.spendPk, b.blinding, b.lockId)).toBe(
      BigInt(n.commitmentLocked),
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
