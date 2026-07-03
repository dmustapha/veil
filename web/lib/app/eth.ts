"use client";

/**
 * Ethereum (Sepolia) collateral leg for Veil v3. The borrower wraps real ETH to WETH, approves the
 * VeilEthLock escrow, and locks `amount` WETH bound to their AVAILABLE note commitment `C` together
 * with a Groth16 opening proof — all signed in the injected wallet (MetaMask); no key touches the app.
 * `lock` also emits an Axelar GMP message `(C, amount)` to the Soroban veil-pool, so the return value
 * surfaces the Axelar ContractCall log the cross-chain wait (lib/app/axelar.ts) polls on.
 */
import {
  createPublicClient, createWalletClient, custom, http, toEventSelector, type Hex, type Log,
} from "viem";
import { sepolia } from "viem/chains";
import {
  AXELAR_GATEWAY_SEPOLIA, SEPOLIA_CHAIN_HEX, SEPOLIA_RPC, VEIL_ETH_LOCK, WETH_SEPOLIA,
} from "@/lib/onchain";
import type { EvmProof } from "@/lib/prove/groth16";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  providers?: Eip1193[];
};
declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

/**
 * Resolve MetaMask specifically, even when several wallet extensions are installed. In a multi-wallet
 * browser `window.ethereum` is a contested, getter-only global — whichever extension won the injection
 * race answers, which may not be the wallet the user connected/switched to Sepolia (this is exactly the
 * source of the -32602 "invalid parameters" on reads). We discover providers via EIP-6963 and pick
 * `io.metamask`, falling back to the legacy `providers[]` array, then to `window.ethereum`.
 */
type Eip6963 = { info: { rdns: string; name: string }; provider: Eip1193 };
const announcedProviders: Eip6963[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent<Eip6963>).detail;
    if (d?.info?.rdns && !announcedProviders.some((p) => p.info.rdns === d.info.rdns)) {
      announcedProviders.push(d);
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** The MetaMask EIP-1193 provider, disambiguated from any co-installed wallets. Throws if truly absent. */
function metaMask(): Eip1193 | undefined {
  const mm = announcedProviders.find((p) => p.info.rdns === "io.metamask");
  if (mm) return mm.provider;
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (eth?.providers?.length) {
    const found = eth.providers.find((p) => p.isMetaMask && !p.isBraveWallet);
    if (found) return found;
  }
  return eth; // last resort: the contested global
}

const WETH_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const LOCK_ABI = [
  {
    type: "function", name: "lock", stateMutability: "payable",
    inputs: [
      { name: "amount", type: "uint256" }, { name: "C", type: "uint256" },
      { name: "pA", type: "uint256[2]" }, { name: "pB", type: "uint256[2][2]" }, { name: "pC", type: "uint256[2]" },
    ],
    outputs: [],
  },
  { type: "function", name: "isLocked", stateMutability: "view", inputs: [{ name: "C", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isReleased", stateMutability: "view", inputs: [{ name: "C", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

/** Selector (topic0) of the Axelar gateway `ContractCall` event — the log that keys the message id. */
export const CONTRACT_CALL_TOPIC = toEventSelector(
  "ContractCall(address,string,string,bytes32,bytes)",
);

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!metaMask();
}

function provider(): Eip1193 {
  const mm = metaMask();
  if (!mm) throw new Error("MetaMask is not installed.");
  return mm;
}

/** Wallet client (signing) — the injected MetaMask provider, which holds the key. */
const walletClient = () => createWalletClient({ chain: sepolia, transport: custom(provider()) });
/** Read client — a fixed Sepolia HTTP RPC, NOT the injected wallet, so reads survive wallet conflicts
 *  and are independent of whatever chain the wallet is currently on. */
const publicClient = () => createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

export async function readChainId(): Promise<string> {
  return (await provider().request({ method: "eth_chainId" })) as string;
}

export async function requestAccounts(): Promise<string[]> {
  return (await provider().request({ method: "eth_requestAccounts" })) as string[];
}

/** Ask the wallet to switch to Sepolia. Returns true if it now reports Sepolia. */
export async function ensureSepolia(): Promise<boolean> {
  try {
    await provider().request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_HEX }] });
  } catch {
    /* user may decline; caller re-reads chainId to decide */
  }
  return (await readChainId()) === SEPOLIA_CHAIN_HEX;
}

/** WETH balance / allowance-for-lock, for gating the wrap+approve steps in the UI. */
export async function wethBalance(account: Hex): Promise<bigint> {
  return publicClient().readContract({ address: WETH_SEPOLIA as Hex, abi: WETH_ABI, functionName: "balanceOf", args: [account] });
}
export async function wethAllowance(account: Hex): Promise<bigint> {
  return publicClient().readContract({ address: WETH_SEPOLIA as Hex, abi: WETH_ABI, functionName: "allowance", args: [account, VEIL_ETH_LOCK as Hex] });
}

/** Wrap `amountWei` of the user's ETH into WETH (`deposit{value}`). Real Sepolia tx. */
export async function wrapEth(account: Hex, amountWei: bigint): Promise<Hex> {
  const hash = await walletClient().writeContract({
    account, address: WETH_SEPOLIA as Hex, abi: WETH_ABI, functionName: "deposit", value: amountWei, chain: sepolia,
  });
  await publicClient().waitForTransactionReceipt({ hash });
  return hash;
}

/** Approve VeilEthLock to pull `amountWei` WETH. Real Sepolia tx. */
export async function approveWeth(account: Hex, amountWei: bigint): Promise<Hex> {
  const hash = await walletClient().writeContract({
    account, address: WETH_SEPOLIA as Hex, abi: WETH_ABI, functionName: "approve", args: [VEIL_ETH_LOCK as Hex, amountWei], chain: sepolia,
  });
  await publicClient().waitForTransactionReceipt({ hash });
  return hash;
}

/** The lock's outcome: the tx hash, and the Axelar ContractCall log the cross-chain wait keys on. */
export interface LockResult {
  txHash: Hex;
  /** Block-global index of the gateway's ContractCall log — one half of the Axelar message id. */
  axelarLogIndex: number | null;
  /** Candidate Axelar message id `${txHash}-${logIndex}`; reconcile against the GMP API before use. */
  messageIdHint: string | null;
}

/**
 * Lock `amount` WETH bound to note commitment `C`, paying `gasWei` of native ETH for Axelar to relay
 * the `(C, amount)` attestation to Soroban. WETH must already be wrapped and approved. Returns the tx
 * hash plus the Axelar ContractCall log coordinates the cross-chain wait needs.
 */
export async function lockCollateral(
  account: Hex,
  amount: bigint,
  C: bigint,
  proof: EvmProof,
  gasWei: bigint,
): Promise<LockResult> {
  const hash = await walletClient().writeContract({
    account, address: VEIL_ETH_LOCK as Hex, abi: LOCK_ABI, functionName: "lock",
    args: [amount, C, proof.pA, proof.pB, proof.pC], value: gasWei, chain: sepolia,
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  const call = findContractCallLog(receipt.logs, AXELAR_GATEWAY_SEPOLIA);
  return {
    txHash: hash,
    axelarLogIndex: call?.logIndex ?? null,
    messageIdHint: call ? `${hash}-${call.logIndex}` : null,
  };
}

export async function isLocked(C: bigint): Promise<boolean> {
  return publicClient().readContract({ address: VEIL_ETH_LOCK as Hex, abi: LOCK_ABI, functionName: "isLocked", args: [C] });
}

export async function isReleased(C: bigint): Promise<boolean> {
  return publicClient().readContract({ address: VEIL_ETH_LOCK as Hex, abi: LOCK_ABI, functionName: "isReleased", args: [C] });
}

/**
 * Find the Axelar gateway's `ContractCall` log in a receipt's logs (pure — matches the gateway address
 * AND the `ContractCall` selector, so the gas service's own event can't be mistaken for it). Returns
 * its block-global `logIndex` and its position within the tx's logs; the Axelar message id derives from
 * `${txHash}-${logIndex}`.
 */
export function findContractCallLog(
  logs: readonly Log[],
  gateway: string,
): { logIndex: number; position: number } | null {
  const g = gateway.toLowerCase();
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (
      log.address.toLowerCase() === g &&
      log.topics[0] === CONTRACT_CALL_TOPIC &&
      log.logIndex != null
    ) {
      return { logIndex: log.logIndex, position: i };
    }
  }
  return null;
}
