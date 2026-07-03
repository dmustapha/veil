// Matched-triple invariant check. Asserts the fresh pool/vault/eth-lock are cross-pinned correctly
// BEFORE the web app is repointed at them — the hard gate for the reverse-leg redeploy. A vault bound
// to the wrong pool, or a pool whose stored eth-lock/vault does not match, silently breaks borrow or
// release with UnknownRoot / fail-closed execute. This reads all four pins on-chain and exits non-zero
// on any mismatch. No keys, no gas (Stellar simulate + Sepolia eth_call only).
//
//   POOL=<P> VAULT=<V> ETHLOCK=<0xE> pnpm tsx scripts/verify-triple.ts
//
// Defaults to the current fresh triple so `pnpm verify:triple` documents the live wiring.
import { Contract, TransactionBuilder, BASE_FEE, rpc, scValToNative } from "@stellar/stellar-sdk";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const SOROBAN_RPC = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
// Any existing funded account works as the read-only simulation source (veil-spike, the deployer).
const SIM_SOURCE = "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF";
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const DEST_CHAIN = "stellar-2026-q1-2"; // Axelar Amplifier chain name for the Soroban destination

const POOL = process.env.POOL || "CBDCEWCXXM6QFGKWA466RF2I5LNY5N2CKMVKLCBIQUXOK5IK5W5INJAQ";
const VAULT = process.env.VAULT || "CB7PH2V266O5GKLPP7CC5VE2LC5RLN5KXHTN6ETR2Y5JWIJIA3XP2TT2";
const ETHLOCK = process.env.ETHLOCK || "0x81078A116b93Da170BB4f7B6282F7a26566e8933";

const ETHLOCK_ABI = [
  { type: "function", name: "destinationChain", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "destinationContract", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

let failed = false;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}\n      got  ${got}\n      want ${want}`);
  if (!ok) failed = true;
};

/** Simulate a no-arg contract call and return its decoded return value. Read-only, no signing. */
async function simulate(srv: rpc.Server, contractId: string, method: string): Promise<unknown> {
  const account = await srv.getAccount(SIM_SOURCE);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method))
    .setTimeout(60)
    .build();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = (await srv.simulateTransaction(tx)) as any;
  if (sim.error) throw new Error(`${method} simulation failed: ${sim.error}`);
  const retval = sim.result?.retval;
  if (!retval) throw new Error(`${method} returned no value`);
  return scValToNative(retval);
}

async function main() {
  console.log(`Matched-triple invariant check\n  POOL=${POOL}\n  VAULT=${VAULT}\n  ETHLOCK=${ETHLOCK}\n`);
  const srv = new rpc.Server(SOROBAN_RPC);

  // Pin 1: the vault is bound to this pool (constructor-immutable veil_pool).
  const cfg = (await simulate(srv, VAULT, "get_config")) as { veil_pool?: string };
  check("V.get_config().veil_pool == POOL", cfg?.veil_pool, POOL);

  // Pin 2: the pool's one-time set_vault points back at this vault.
  check("POOL.vault_addr() == VAULT", await simulate(srv, POOL, "vault_addr"), VAULT);

  // Pin 3: the pool's one-time set_eth_lock points at this eth-lock (checksummed, as Axelar delivers it).
  check("POOL.eth_lock_addr() == ETHLOCK", await simulate(srv, POOL, "eth_lock_addr"), ETHLOCK);

  // Pin 4: the eth-lock's one-time setDestination points forward at this pool (+ correct Amplifier chain).
  const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
  const [destChain, destContract] = await Promise.all([
    client.readContract({ address: ETHLOCK as `0x${string}`, abi: ETHLOCK_ABI, functionName: "destinationChain" }),
    client.readContract({ address: ETHLOCK as `0x${string}`, abi: ETHLOCK_ABI, functionName: "destinationContract" }),
  ]);
  check("ETHLOCK.destinationContract() == POOL", destContract, POOL);
  check("ETHLOCK.destinationChain() == DEST_CHAIN", destChain, DEST_CHAIN);

  if (failed) {
    console.error("\n✗ INVARIANT FAILED — do NOT repoint the app at this triple.");
    process.exit(1);
  }
  console.log("\n✓ All four pins consistent — the matched triple is safe to repoint.");
}

main().catch((e) => { console.error(e); process.exit(1); });
