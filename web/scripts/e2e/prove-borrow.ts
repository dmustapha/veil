// Generate the BORROW proof for the 6d e2e. Usage: tsx prove-borrow.ts <rootR1> <cAvailable>
// Prints a single JSON line { proof:{a,b,c hex}, positionId, lockHandle, root, threshold, borrower }
// for the bash orchestrator to feed into `stellar contract invoke ... borrow`. Proves that the LOCKED
// note (leaf 1, minted by the lock) of hidden amount ≥ threshold is a member of the live pool root R1.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBorrowWitness, type MerklePath, type Note } from "../../lib/prove/witness";
import { proveBorrow, toSorobanProof, publicSignalsToBorrowArgs } from "../../lib/prove/groth16";
import {
  AMOUNT, BLINDING_OUT, LOAN_SECRET, LOCK_ID, SPEND_PK, SPIKE, THRESHOLD, ZEROS, proofJson,
} from "./params";

const HERE = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = resolve(HERE, "../../public/circuits/borrow");

async function main() {
  const rootR1 = process.argv[2];
  const cAvailable = process.argv[3];
  if (!rootR1 || !cAvailable) throw new Error("usage: prove-borrow.ts <rootR1> <cAvailable>");

  // The LOCKED note carries the SAME amount + spendPk + lockId, but the mint blinding (blindingOut).
  const note: Note = {
    amount: AMOUNT,
    blinding: BLINDING_OUT, // the LOCKED note's blinding
    spendPk: SPEND_PK,
    lockId: LOCK_ID,
    loanSecret: LOAN_SECRET,
  };
  // LOCKED note is leaf 1 → its level-0 sibling is leaf 0 (C_available); levels 1..15 stay zeros.
  const pathElements = [BigInt(cAvailable), ...ZEROS.slice(1)];
  const path: MerklePath = { leafIndex: 1n, pathElements, root: BigInt(rootR1) };

  const witness = buildBorrowWitness(note, path, THRESHOLD, SPIKE);
  const { proof, publicSignals } = await proveBorrow(witness, {
    wasm: resolve(CIRCUITS, "borrow.wasm"),
    zkey: resolve(CIRCUITS, "borrow.zkey"),
  });
  const args = publicSignalsToBorrowArgs(publicSignals);
  if (args.root !== BigInt(rootR1)) throw new Error("proof root != R1");
  const sp = toSorobanProof(proof);
  process.stdout.write(
    JSON.stringify({
      proof: JSON.parse(proofJson(sp.a, sp.b, sp.c)),
      positionId: args.positionId.toString(),
      lockHandle: args.lockHandle.toString(),
      root: args.root.toString(),
      threshold: THRESHOLD.toString(),
      borrower: SPIKE,
    }) + "\n",
  );
}

main().catch((e) => {
  console.error(e?.message ?? String(e));
  process.exit(1);
});
