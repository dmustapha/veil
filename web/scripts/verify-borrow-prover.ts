// Phase-5 verification harness for the client-side borrow prover. Proves that a proof produced by
// the SHIPPED web assets (public/circuits/borrow/*) + the lib/prove modules:
//   1. verifies offline via snarkjs against the committed vkey, and
//   2. verifies ON-CHAIN on the LIVE deployed borrow verifier (Stellar testnet) — a real `true` —
//      while a tampered public signal is rejected (InvalidProof).
// This is the Groth16 analogue of circom/smoke.sh: run `pnpm verify:prover` (needs testnet RPC).
//
// It exercises the real modules end-to-end (buildBorrowWitness → proveBorrow → toSorobanProof →
// publicSignalsToFieldBytes), so a regression in the encoding or witness assembly fails here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as snarkjs from "snarkjs";
import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { borrowerField, buildBorrowWitness, type MerklePath, type Note } from "../lib/prove/witness";
import { proveBorrow, toSorobanProof } from "../lib/prove/groth16";

const HERE = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = resolve(HERE, "../public/circuits/borrow");
const CANONICAL = resolve(HERE, "../../circom/borrow_input.json"); // known-good Phase-3 witness

const SOROBAN_RPC = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const BORROW_VERIFIER = "CBTSWUY5OME4EDY3YA7OBRXHVMSBZH4MWO4GSGNPR4FAGG36RGQGDMM2";
const SOURCE = "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF"; // veil-spike (exists on testnet)

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const scvBytes = (u: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(u));

function verifyOp(proofScVal: xdr.ScVal, publicScVal: xdr.ScVal) {
  const source = new Account(SOURCE, "0");
  return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(new Contract(BORROW_VERIFIER).call("verify", proofScVal, publicScVal))
    .setTimeout(30)
    .build();
}

/** Build the verifier's (proof, public_inputs) ScVals from a snarkjs proof + public signals. */
function toVerifyArgs(proof: Parameters<typeof toSorobanProof>[0], publicSignals: string[]) {
  const sp = toSorobanProof(proof);
  if (sp.a.length !== 64 || sp.b.length !== 128 || sp.c.length !== 64) {
    fail(`bad proof point sizes: a=${sp.a.length} b=${sp.b.length} c=${sp.c.length}`);
  }
  const proofScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: scvBytes(sp.a) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: scvBytes(sp.b) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: scvBytes(sp.c) }),
  ]);
  // public_inputs is Vec<Bn254Fr>, which marshals as Array<u256> (NOT Bytes) — pass scvU256.
  const publicScVal = xdr.ScVal.scvVec(publicSignals.map((s) => nativeToScVal(BigInt(s), { type: "u256" })));
  return { proofScVal, publicScVal };
}

// Cross-impl lock (audit H-01): borrowerField must equal the on-chain borrower_field for this exact
// strkey. The SAME vector is asserted in contracts/veil-vault/src/test.rs. If either side drifts,
// real borrows break (the vault re-derives borrower_field and asserts equality).
const BORROWER_VECTOR =
  15637106958901504754331470705993550837370540567027527858459923834990562324508n;

async function main() {
  if (borrowerField(SOURCE) !== BORROWER_VECTOR) {
    fail("borrowerField diverged from the on-chain borrower_field cross-vector");
  }
  console.log("• borrowerField == on-chain borrower_field (cross-vector locked)");

  // 1. Build the witness from the canonical (Phase-3, on-chain-verified) note vector, but via the
  //    real client modules — including a real Stellar strkey through borrowerField.
  const v = JSON.parse(readFileSync(CANONICAL, "utf8"));
  const note: Note = {
    amount: BigInt(v.amount),
    blinding: BigInt(v.blinding),
    spendPk: BigInt(v.spendPk),
    lockId: BigInt(v.lockId),
    loanSecret: BigInt(v.loanSecret),
  };
  const path: MerklePath = {
    leafIndex: BigInt(v.leafIndex),
    pathElements: (v.pathElements as string[]).map((x) => BigInt(x)),
    root: BigInt(v.root),
  };
  const witness = buildBorrowWitness(note, path, BigInt(v.threshold), SOURCE);
  console.log("• witness assembled (borrower bound to strkey via keccak256 mod r)");

  // 2. Prove client-side using the SHIPPED web assets.
  const { proof, publicSignals } = await proveBorrow(witness, {
    wasm: resolve(CIRCUITS, "borrow.wasm"),
    zkey: resolve(CIRCUITS, "borrow.zkey"),
  });
  console.log(`• proved client-side (nPublic=${publicSignals.length})`);
  if (publicSignals.length !== 5) fail(`expected 5 public signals, got ${publicSignals.length}`);
  if (BigInt(publicSignals[2]) !== path.root) fail("public root != witness root");

  // 3. Offline verify against the committed vkey.
  const vkey = JSON.parse(readFileSync(resolve(CIRCUITS, "borrow.vk.json"), "utf8"));
  const offline = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (offline !== true) fail("snarkjs offline verify returned false");
  console.log("• snarkjs offline verify → true");

  // 4. Live on-chain verify on the deployed borrow verifier — a REAL `true` from the network. The
  //    proof struct marshals as { a,b,c: Bytes }; public_inputs marshal as Array<u256> (Bn254Fr →
  //    ScVal::U256, NOT Bytes). A valid proof must verify; a tampered public signal must be rejected.
  const server = new rpc.Server(SOROBAN_RPC);
  const good = toVerifyArgs(proof, publicSignals);
  const sim = await server.simulateTransaction(verifyOp(good.proofScVal, good.publicScVal));
  if (rpc.Api.isSimulationError(sim)) fail(`on-chain verify errored on a REAL proof: ${sim.error}`);
  if (scValToNative(sim.result!.retval) !== true) fail("on-chain verify returned non-true");
  console.log(`• on-chain verify (${BORROW_VERIFIER.slice(0, 8)}…) → true`);

  const tampered = [...publicSignals];
  tampered[4] = (BigInt(tampered[4]) + 1n).toString();
  const bad = toVerifyArgs(proof, tampered);
  const simBad = await server.simulateTransaction(verifyOp(bad.proofScVal, bad.publicScVal));
  const rejected = rpc.Api.isSimulationError(simBad) || scValToNative(simBad.result!.retval) !== true;
  if (!rejected) fail("tampered public signal was ACCEPTED on-chain (defense broken)");
  console.log("• on-chain verify (tampered public[4]) → rejected (InvalidProof)");

  console.log(
    "\n✅ Client-side borrow prover: proved in-process → snarkjs-verified → verified TRUE on the live" +
      " Soroban verifier (tamper rejected). ZK is load-bearing on-chain.",
  );
}

main().catch((e) => fail(e?.message ?? String(e)));
