/**
 * Server-only Soroban + Sepolia read helpers. JS SDKs only (Vercel-deployable,
 * no CLI shell-outs). Reads/simulations only: no private key is ever used.
 */
import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  BORROWER,
  REFLECTOR,
  REFLECTOR_ASSET_SYMBOL,
  SOROBAN_RPC,
  TESTNET_PASSPHRASE,
  VAULT,
  sepoliaRpc,
} from "@/lib/onchain";

const server = () => new rpc.Server(SOROBAN_RPC);

/** Retry once: testnet RPC is flaky. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

const hexToBuf = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex");

const bytesVal = (hex: string) => nativeToScVal(hexToBuf(hex));

/** Asset::Other(Symbol("ETH")) as an ScVal. */
const ethAssetVal = () =>
  xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Other"),
    xdr.ScVal.scvSymbol(REFLECTOR_ASSET_SYMBOL),
  ]);

function buildTx(op: xdr.Operation) {
  const source = new Account(BORROWER, "0");
  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();
}

/** Simulate a read call and return the decoded return value. Throws on error. */
async function simRead(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<unknown> {
  const tx = buildTx(new Contract(contractId).call(method, ...args));
  const sim = await server().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  const retval = sim.result?.retval;
  if (!retval) throw new Error("no retval");
  return scValToNative(retval);
}

type SorobanConfig = Record<string, unknown>;
type SorobanLoan = Record<string, unknown> | null;
type SorobanPrice = { price: bigint; timestamp: bigint | number };

export const readConfig = (): Promise<SorobanConfig> =>
  simRead(VAULT, "get_config", []) as Promise<SorobanConfig>;

export const readLoan = (hashlock: string): Promise<SorobanLoan> =>
  simRead(VAULT, "get_loan", [bytesVal(hashlock)]) as Promise<SorobanLoan>;

export const readPrice = (): Promise<SorobanPrice> =>
  simRead(REFLECTOR, "lastprice", [ethAssetVal()]) as Promise<SorobanPrice>;

export const readPriceDecimals = (): Promise<number> =>
  simRead(REFLECTOR, "decimals", []) as Promise<number>;

/** Sepolia escrow lock read. amount is read but DELIBERATELY never returned. */
export async function readLock(
  escrow: string,
  hashlock: string
): Promise<{ locked: boolean; closed: boolean }> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(sepoliaRpc()),
  });
  const abi = [
    {
      type: "function",
      name: "locks",
      stateMutability: "view",
      inputs: [{ name: "H", type: "bytes32" }],
      outputs: [
        { name: "depositor", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "H", type: "bytes32" },
        { name: "deadline", type: "uint64" },
        { name: "closed", type: "bool" },
      ],
    },
  ] as const;
  const res = (await client.readContract({
    address: escrow as `0x${string}`,
    abi,
    functionName: "locks",
    args: [hashlock as `0x${string}`],
  })) as readonly [string, bigint, string, bigint, boolean];
  const depositor = res[0];
  const closed = res[4];
  // res[1] is the real collateral amount: never surfaced (privacy invariant).
  return {
    locked: depositor !== "0x0000000000000000000000000000000000000000",
    closed,
  };
}

/**
 * Simulate a borrow with a tampered seal (one body byte flipped, selector
 * 73c457ba intact) against the LIVE vault. Returns the raw simulation error.
 */
export async function simulateCheat(
  sealHex: string,
  journalHex: string
): Promise<{ ok: boolean; error: string }> {
  const seal = hexToBuf(sealHex);
  // Flip one byte inside the G2 point region (keep the 4-byte selector).
  const tampered = Buffer.from(seal);
  tampered[195] ^= 0x01;

  const op = new Contract(VAULT).call(
    "borrow",
    nativeToScVal(tampered),
    bytesVal(journalHex),
    nativeToScVal(BORROWER, { type: "address" })
  );
  const sim = await server().simulateTransaction(buildTx(op));
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: sim.error };
  // A tampered proof simulating cleanly would be a real failure of the defense.
  return { ok: true, error: "" };
}
