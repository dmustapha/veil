// Live validation of the client-side tree reconstruction (run once the fresh v3 pool has emitted
// deposit/lock events, i.e. at Phase 7f/7g). Replays the pool's leaf events, rebuilds the depth-16
// tree on-device with the ported Poseidon2, and asserts the reconstructed root equals the pool's
// on-chain `root()` — proving a browser can derive a valid Merkle path with no server and no secrets.
//
//   POOL=<C...> [DEPLOY_LEDGER=N] [RPC=https://...] npx tsx scripts/validate-tree.ts
import { Account, Contract, TransactionBuilder, BASE_FEE, rpc, scValToNative } from "@stellar/stellar-sdk";
import { computeRoot, fetchLeafEvents, indexLeaves } from "../lib/prove/tree";

const RPC = process.env.RPC || "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const POOL = process.env.POOL;
// Any account works for a read-only simulate; this well-known testnet address needn't be funded.
const READER = process.env.READER || "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF";

async function onchainRoot(server: rpc.Server, poolId: string): Promise<bigint> {
  const tx = new TransactionBuilder(new Account(READER, "0"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(poolId).call("root"))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`root() simulate failed: ${sim.error}`);
  return scValToNative(sim.result!.retval) as bigint;
}

async function main() {
  if (!POOL) throw new Error("set POOL=<contract id>");
  const server = new rpc.Server(RPC);
  const latest = (await server.getLatestLedger()).sequence;
  const deploy = process.env.DEPLOY_LEDGER ? Number(process.env.DEPLOY_LEDGER) : latest - 100_000;
  const startLedger = Math.max(1, Math.min(deploy, latest - 1));

  console.log(`RPC=${RPC}\nPOOL=${POOL}\nstartLedger=${startLedger} (latest=${latest})`);
  const events = await fetchLeafEvents(server, POOL, startLedger);
  console.log(`fetched ${events.length} leaf events`);
  const leaves = indexLeaves(events);
  const reconstructed = computeRoot(leaves);
  const onchain = await onchainRoot(server, POOL);

  const hex = (v: bigint) => "0x" + v.toString(16).padStart(64, "0");
  console.log(`reconstructed root: ${hex(reconstructed)}`);
  console.log(`on-chain root:      ${hex(onchain)}`);
  if (reconstructed !== onchain) {
    console.error("✗ MISMATCH — reconstruction does not match the on-chain tree");
    process.exit(1);
  }
  console.log(`✓ MATCH — ${leaves.length} leaves reconstructed to the on-chain root`);
}

main().catch((e) => { console.error(e); process.exit(1); });
