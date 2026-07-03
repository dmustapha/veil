"use client";

/**
 * Ethereum (Sepolia) collateral leg for Veil v3. The borrower wraps real ETH to WETH, approves the
 * VeilEthLock escrow, and locks `amount` WETH bound to their AVAILABLE note commitment `C` together
 * with a Groth16 opening proof — all signed in the injected wallet (MetaMask); no key touches the app.
 * `lock` also emits an Axelar GMP message `(C, amount)` to the Soroban veil-pool, so the return value
 * surfaces the Axelar ContractCall log the cross-chain wait (lib/app/axelar.ts) polls on.
 */
import {
  createPublicClient, createWalletClient, custom, toEventSelector, type Hex, type Log,
} from "viem";
import { sepolia } from "viem/chains";
import {
  AXELAR_GATEWAY_SEPOLIA, SEPOLIA_CHAIN_HEX, VEIL_ETH_LOCK, WETH_SEPOLIA,
} from "@/lib/onchain";
import type { EvmProof } from "@/lib/prove/groth16";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};
declare global {
  interface Window {
    ethereum?: Eip1193;
  }
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
] as const;

/** Selector (topic0) of the Axelar gateway `ContractCall` event — the log that keys the message id. */
export const CONTRACT_CALL_TOPIC = toEventSelector(
  "ContractCall(address,string,string,bytes32,bytes)",
);

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

function provider(): Eip1193 {
  if (!window.ethereum) throw new Error("MetaMask is not installed.");
  return window.ethereum;
}

const walletClient = () => createWalletClient({ chain: sepolia, transport: custom(provider()) });
const publicClient = () => createPublicClient({ chain: sepolia, transport: custom(provider()) });

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
