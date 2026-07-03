// Phase-6d verification harness for the client-side LOCK prover. Proves that a proof produced by the
// shipped web assets (public/circuits/lock/*) + lib/prove/lock.ts:
//   1. verifies offline via snarkjs against the committed lock vkey, and
//   2. verifies ON-CHAIN on the LIVE deployed lock verifier (Stellar testnet) — a real `true` — while
//      a tampered public signal is rejected (InvalidProof).
// The lock analogue of verify-borrow-prover.ts: run `pnpm verify:lock-prover` (needs testnet RPC).
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
import { buildLockWitness, type LockMerklePath, type LockNote } from "../lib/prove/lock";
import { proveLock, toSorobanProof } from "../lib/prove/groth16";

const HERE = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = resolve(HERE, "../public/circuits/lock");
const CANONICAL = resolve(HERE, "../../circom/lock_input.json"); // known-good Phase-2 lock witness

const SOROBAN_RPC = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const LOCK_VERIFIER = "CA4XWFDN4BDKRDVJ43IQLFQ6IGMU477OAEQXBYFCX2NQ7JWVJHE5A4TE";
const SOURCE = "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF"; // veil-spike (exists on testnet)

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const scvBytes = (u: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(u));

function verifyOp(proofScVal: xdr.ScVal, publicScVal: xdr.ScVal) {
  const source = new Account(SOURCE, "0");
  return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(new Contract(LOCK_VERIFIER).call("verify", proofScVal, publicScVal))
    .setTimeout(30)
    .build();
}

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

async function main() {
  // 1. Build the lock witness from the canonical (Phase-2) vector via the real client module.
  const v = JSON.parse(readFileSync(CANONICAL, "utf8"));
  const note: LockNote = {
    amount: BigInt(v.amount),
    blindingIn: BigInt(v.blindingIn),
    spendPk: BigInt(v.spendPk),
    nk: BigInt(v.nk),
    lockId: BigInt(v.lockId),
    blindingOut: BigInt(v.blindingOut),
    r: BigInt(v.r), // B1′ binding random (persisted in lock_input.json)
  };
  const path: LockMerklePath = {
    leafIndex: BigInt(v.leafIndex),
    pathElements: (v.pathElements as string[]).map((x) => BigInt(x)),
    root: BigInt(v.root),
  };
  const witness = buildLockWitness(note, path);
  console.log("• lock witness assembled (spendPk bound to nk in-circuit)");

  // 2. Prove client-side using the SHIPPED web assets.
  const { proof, publicSignals } = await proveLock(witness, {
    wasm: resolve(CIRCUITS, "lock.wasm"),
    zkey: resolve(CIRCUITS, "lock.zkey"),
  });
  console.log(`• proved client-side (nPublic=${publicSignals.length})`);
  if (publicSignals.length !== 4) fail(`expected 4 lock public signals, got ${publicSignals.length}`);
  // publicSignals = [nullifierOut, commitmentOut, root, lockId]; root/lockId must echo the witness.
  if (BigInt(publicSignals[2]) !== path.root) fail("public root != witness root");
  if (BigInt(publicSignals[3]) !== note.lockId) fail("public lockId != witness lockId");

  // 3. Offline verify against the committed vkey.
  const vkey = JSON.parse(readFileSync(resolve(CIRCUITS, "lock.vk.json"), "utf8"));
  const offline = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (offline !== true) fail("snarkjs offline verify returned false");
  console.log("• snarkjs offline verify → true");

  // 4. Live on-chain verify on the deployed lock verifier — a REAL `true` from the network.
  const server = new rpc.Server(SOROBAN_RPC);
  const good = toVerifyArgs(proof, publicSignals);
  const sim = await server.simulateTransaction(verifyOp(good.proofScVal, good.publicScVal));
  if (rpc.Api.isSimulationError(sim)) fail(`on-chain verify errored on a REAL proof: ${sim.error}`);
  if (scValToNative(sim.result!.retval) !== true) fail("on-chain verify returned non-true");
  console.log(`• on-chain verify (${LOCK_VERIFIER.slice(0, 8)}…) → true`);

  // A tampered nullifier (public[0]) must be rejected.
  const tampered = [...publicSignals];
  tampered[0] = (BigInt(tampered[0]) + 1n).toString();
  const bad = toVerifyArgs(proof, tampered);
  const simBad = await server.simulateTransaction(verifyOp(bad.proofScVal, bad.publicScVal));
  const rejected = rpc.Api.isSimulationError(simBad) || scValToNative(simBad.result!.retval) !== true;
  if (!rejected) fail("tampered lock public signal was ACCEPTED on-chain (defense broken)");
  console.log("• on-chain verify (tampered public[0]=nullifier) → rejected (InvalidProof)");

  console.log(
    "\n✅ Client-side LOCK prover: proved in-process → snarkjs-verified → verified TRUE on the live" +
      " Soroban lock verifier (tamper rejected). ZK is load-bearing on-chain.",
  );
}

main().catch((e) => fail(e?.message ?? String(e)));
