// Generate the LOCK proof for the 6d e2e. Usage: pnpm e2e:prove-lock <rootR0>  (sets VEIL_E2E=1)
// Prints a single JSON line { proof:{a,b,c hex}, nullifier, commitment, root, lockId } for the bash
// orchestrator to feed into `stellar contract invoke ... lock`. The witness never leaves this process.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLockWitness, type LockMerklePath, type LockNote } from "../../lib/prove/lock";
import { proveLock, toSorobanProof, publicSignalsToLockArgs } from "../../lib/prove/groth16";
import { AMOUNT, BLINDING_IN, BLINDING_OUT, LOCK_ID, NK, SPEND_PK, ZEROS, proofJson } from "./params";

const HERE = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = resolve(HERE, "../../public/circuits/lock");

async function main() {
  const rootR0 = process.argv[2];
  if (!rootR0) throw new Error("usage: prove-lock.ts <rootR0>");

  const note: LockNote = {
    amount: AMOUNT,
    blindingIn: BLINDING_IN,
    spendPk: SPEND_PK,
    nk: NK,
    lockId: LOCK_ID,
    blindingOut: BLINDING_OUT,
  };
  // AVAILABLE note is leaf 0 of the fresh tree → siblings are the empty-tree zeros.
  const path: LockMerklePath = { leafIndex: 0n, pathElements: ZEROS, root: BigInt(rootR0) };

  const witness = buildLockWitness(note, path);
  const { proof, publicSignals } = await proveLock(witness, {
    wasm: resolve(CIRCUITS, "lock.wasm"),
    zkey: resolve(CIRCUITS, "lock.zkey"),
  });
  const args = publicSignalsToLockArgs(publicSignals);
  if (args.root !== BigInt(rootR0)) throw new Error("proof root != R0");
  const sp = toSorobanProof(proof);
  process.stdout.write(
    JSON.stringify({
      proof: JSON.parse(proofJson(sp.a, sp.b, sp.c)),
      nullifier: args.nullifierOut.toString(),
      commitment: args.commitmentOut.toString(),
      root: args.root.toString(),
      lockId: args.lockId.toString(),
    }) + "\n",
  );
}

main().catch((e) => {
  console.error(e?.message ?? String(e));
  process.exit(1);
});
