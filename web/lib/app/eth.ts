"use client";

/**
 * Real Sepolia interactions via viem + the injected wallet (MetaMask). Every
 * write here is a transaction the user signs in their wallet. No private key
 * ever lives in the app.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  keccak256,
  parseEther,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { ESCROW, SEPOLIA_CHAIN_HEX } from "@/lib/onchain";

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

export const ESCROW_ABI = [
  {
    type: "function",
    name: "lock",
    stateMutability: "payable",
    inputs: [
      { name: "H", type: "bytes32" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRepaid",
    stateMutability: "nonpayable",
    inputs: [{ name: "S", type: "bytes32" }],
    outputs: [],
  },
] as const;

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

function provider(): Eip1193 {
  if (!window.ethereum) throw new Error("MetaMask is not installed.");
  return window.ethereum;
}

const walletClient = () =>
  createWalletClient({ chain: sepolia, transport: custom(provider()) });
const publicClient = () =>
  createPublicClient({ chain: sepolia, transport: custom(provider()) });

/** A fresh 32-byte secret S, and its hashlock H = keccak256(S). */
export function newSecret(): { secret: Hex; h: Hex } {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  const secret = ("0x" +
    Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
  return { secret, h: keccak256(secret) };
}

export async function readChainId(): Promise<string> {
  return (await provider().request({ method: "eth_chainId" })) as string;
}

export async function requestAccounts(): Promise<string[]> {
  return (await provider().request({
    method: "eth_requestAccounts",
  })) as string[];
}

/** Ask the wallet to switch to Sepolia. Returns true if it now reports Sepolia. */
export async function ensureSepolia(): Promise<boolean> {
  try {
    await provider().request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
  } catch {
    /* user may decline; caller re-reads chainId to decide */
  }
  return (await readChainId()) === SEPOLIA_CHAIN_HEX;
}

/** Lock `amountEth` of the user's own ETH under hashlock H. Real Sepolia tx. */
export async function lockCollateral(
  account: Hex,
  h: Hex,
  deadline: number,
  amountEth: string
): Promise<Hex> {
  const hash = await walletClient().writeContract({
    account,
    address: ESCROW as Hex,
    abi: ESCROW_ABI,
    functionName: "lock",
    args: [h, BigInt(deadline)],
    value: parseEther(amountEth),
    chain: sepolia,
  });
  await publicClient().waitForTransactionReceipt({ hash });
  return hash;
}

/** Reveal S on Ethereum to return the collateral to its depositor. Real tx. */
export async function claimRepaid(account: Hex, secret: Hex): Promise<Hex> {
  const hash = await walletClient().writeContract({
    account,
    address: ESCROW as Hex,
    abi: ESCROW_ABI,
    functionName: "claimRepaid",
    args: [secret],
    chain: sepolia,
  });
  await publicClient().waitForTransactionReceipt({ hash });
  return hash;
}
