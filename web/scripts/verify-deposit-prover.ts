// Live proof of the deposit_from_eth client prover: generate the opening proof in-process, transcode
// it to EVM calldata, and call the DEPLOYED Sepolia DepositFromEthVerifier.verifyProof — the exact
// verifier VeilEthLock.lock invokes. A real proof must return true; a tampered amount must return
// false. Read-only (eth_call); no key, no gas.  Run: `pnpm verify:deposit-prover`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { depositPubSignals, proveDepositFromEth, toEvmProof } from "../lib/prove/groth16";
import { amountToField, noteCommitment, DS_NOTE_AVAILABLE } from "../lib/prove/notes";

const VERIFIER = "0xfe346c22f793032a1f5d3ba18d940fe27e9fc19f" as const; // Sepolia (DEPLOYMENTS.md Phase 7-real)
const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const DIR = resolve(import.meta.dirname, "../public/circuits/deposit_from_eth");
const ASSETS = {
  wasm: resolve(DIR, "deposit_from_eth.wasm"),
  zkey: resolve(DIR, "deposit_from_eth.zkey"),
};

const ABI = [
  {
    type: "function",
    name: "verifyProof",
    stateMutability: "view",
    inputs: [
      { name: "pA", type: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]" },
      { name: "pubSignals", type: "uint256[2]" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const fail = (m: string) => { console.error(`✗ ${m}`); process.exit(1); };

async function main() {
  JSON.parse(readFileSync(resolve(DIR, "deposit_from_eth.vk.json"), "utf8")); // asset presence check

  const amount = 2_000_000_000_000_000_000n;
  const C = noteCommitment(DS_NOTE_AVAILABLE, amountToField(amount), 2n, 1n, 0n);
  console.log(`proving deposit_from_eth (amount=${amount}, C=${C})…`);
  const { proof, publicSignals } = await proveDepositFromEth(
    { amount: amount.toString(), C: C.toString(), spendPk: "2", blinding: "1" }, ASSETS,
  );
  const { pA, pB, pC } = toEvmProof(proof);
  const pub = depositPubSignals(publicSignals);

  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const call = (signals: [bigint, bigint]) =>
    client.readContract({ address: VERIFIER, abi: ABI, functionName: "verifyProof", args: [pA, pB, pC, signals] });

  const ok = await call(pub);
  console.log(`live verifyProof(real) = ${ok}`);
  if (ok !== true) fail("live verifier rejected a valid proof");

  const tampered: [bigint, bigint] = [pub[0] + 1n, pub[1]]; // claim more WETH than the note commits
  const bad = await call(tampered);
  console.log(`live verifyProof(tampered amount) = ${bad}`);
  if (bad !== false) fail("live verifier ACCEPTED a tampered amount");

  console.log("✓ deposit_from_eth prover verified on the live Sepolia verifier (real→true, tampered→false)");
}

main().catch((e) => { console.error(e); process.exit(1); });
