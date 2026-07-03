// Live read-only check that the deployed VeilEthLock matches the app's constants and is ready to
// accept a lock: WETH = canonical Sepolia WETH, verifier = the deposit_from_eth verifier, and its
// Axelar destination is set (an unset destination makes lock() revert DestinationUnset). No key/gas.
import { createPublicClient, http, getAddress } from "viem";
import { sepolia } from "viem/chains";
import {
  AXELAR_GATEWAY_SEPOLIA, DEPOSIT_VERIFIER, VEIL_ETH_LOCK, WETH_SEPOLIA,
} from "../lib/onchain";

const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const ABI = [
  { type: "function", name: "weth", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "verifier", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "gateway", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "destinationChain", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "destinationContract", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "totalLocked", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const fail = (m: string) => { console.error(`✗ ${m}`); process.exitCode = 1; };
const eq = (a: string, b: string) => getAddress(a) === getAddress(b);

async function main() {
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const read = (functionName: (typeof ABI)[number]["name"]) =>
    client.readContract({ address: VEIL_ETH_LOCK as `0x${string}`, abi: ABI, functionName });

  const [weth, verifier, gateway, destChain, destContract, totalLocked] = await Promise.all([
    read("weth"), read("verifier"), read("gateway"), read("destinationChain"), read("destinationContract"), read("totalLocked"),
  ]);

  console.log(`VeilEthLock ${VEIL_ETH_LOCK}`);
  console.log(`  weth()                = ${weth}`);
  console.log(`  verifier()            = ${verifier}`);
  console.log(`  gateway()             = ${gateway}`);
  console.log(`  destinationChain()    = ${destChain}`);
  console.log(`  destinationContract() = ${destContract}`);
  console.log(`  totalLocked()         = ${totalLocked}`);

  if (!eq(weth as string, WETH_SEPOLIA)) fail(`weth mismatch (want ${WETH_SEPOLIA})`);
  if (!eq(verifier as string, DEPOSIT_VERIFIER)) fail(`verifier mismatch (want ${DEPOSIT_VERIFIER})`);
  if (!eq(gateway as string, AXELAR_GATEWAY_SEPOLIA)) fail(`gateway mismatch (want ${AXELAR_GATEWAY_SEPOLIA})`);
  if (!(destChain as string) || !(destContract as string)) fail("Axelar destination unset — lock() would revert");

  if (!process.exitCode) console.log("✓ VeilEthLock wiring matches app constants and is lock-ready");
}

main().catch((e) => { console.error(e); process.exit(1); });
