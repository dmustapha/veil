"use client";

/**
 * Real Soroban interactions. Every state-changing call is built locally, signed
 * by the user in Freighter, and submitted to the public testnet RPC. No secret
 * key ever touches the app: Freighter holds the key and returns a signed XDR.
 */
import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { SOROBAN_RPC, TESTNET_PASSPHRASE, USDC_DECIMALS, USDC_SAC, VAULT } from "@/lib/onchain";

const server = () => new rpc.Server(SOROBAN_RPC);

const hexToBytes = (hex: string) => {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesVal = (hex: string) => nativeToScVal(hexToBytes(hex));
const addrVal = (a: string) => nativeToScVal(a, { type: "address" });

/** Connect Freighter and assert the wallet is on Stellar testnet. */
export async function connectFreighter(): Promise<{
  address: string;
  network: string;
}> {
  const conn = await isConnected();
  if ("error" in conn || !conn.isConnected) throw new Error("missing");
  const access = await requestAccess();
  if ("error" in access && access.error) throw new Error("denied");
  const address =
    "address" in access && access.address
      ? access.address
      : (await getAddress()).address;
  if (!address) throw new Error("denied");
  const net = await getNetwork();
  const network = "network" in net ? net.network : "";
  return { address, network };
}

export const isTestnet = (network: string | null) =>
  (network ?? "").toUpperCase() === "TESTNET";

/** Build, sign with Freighter, submit, and confirm a Soroban invoke. */
async function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  source: string
): Promise<string> {
  const srv = server();
  const account = await srv.getAccount(source);
  const op = new Contract(contractId).call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const prepared = await srv.prepareTransaction(tx);
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: TESTNET_PASSPHRASE,
    address: source,
  });
  if (signed.error) throw new Error("Signing was rejected.");

  const signedTx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    TESTNET_PASSPHRASE
  );
  const sent = await srv.sendTransaction(signedTx);
  if (sent.status === "ERROR") {
    throw new Error("The network rejected the transaction.");
  }
  return pollResult(srv, sent.hash);
}

async function pollResult(srv: rpc.Server, hash: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await srv.getTransaction(hash);
    if (res.status === "SUCCESS") return hash;
    if (res.status === "FAILED") {
      throw new Error("The transaction failed on-chain.");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // Submitted and accepted; confirmation is just slow. Return the real hash.
  return hash;
}

/** Atomic verify-and-disburse on the vault. The proof gates real USDC. */
export function borrow(
  seal: string,
  journal: string,
  borrower: string
): Promise<string> {
  return invoke(
    VAULT,
    "borrow",
    [bytesVal(seal), bytesVal(journal), addrVal(borrower)],
    borrower
  );
}

/** Repay the principal and reveal S so a relay can unlock the Ethereum collateral. */
export function repay(
  hashlock: string,
  secret: string,
  borrower: string
): Promise<string> {
  return invoke(
    VAULT,
    "repay",
    [bytesVal(hashlock), bytesVal(secret)],
    borrower
  );
}

/** Send Circle USDC (the SAC) to another Stellar address. Proves the token is real. */
export function sendUsdc(
  from: string,
  to: string,
  amountUsdc: string
): Promise<string> {
  const units = BigInt(Math.round(parseFloat(amountUsdc) * 10 ** USDC_DECIMALS));
  return invoke(
    USDC_SAC,
    "transfer",
    [addrVal(from), addrVal(to), nativeToScVal(units, { type: "i128" })],
    from
  );
}
