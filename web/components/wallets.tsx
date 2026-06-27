"use client";

import { useCallback, useState } from "react";
import {
  getAddress,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import { SEPOLIA_CHAIN_HEX } from "@/lib/onchain";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export type WalletState =
  | "idle"
  | "connecting"
  | "connected"
  | "missing"
  | "error";

const truncate = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function connectMetaMask(): Promise<string> {
  const eth = window.ethereum;
  if (!eth) throw new Error("missing");
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
  } catch {
    /* user may decline the network switch; the address is still connected */
  }
  return accounts[0];
}

async function connectFreighter(): Promise<string> {
  const conn = await isConnected();
  if ("error" in conn || !conn.isConnected) throw new Error("missing");
  const access = await requestAccess();
  if ("error" in access && access.error) throw new Error("denied");
  const addr =
    "address" in access && access.address
      ? access.address
      : (await getAddress()).address;
  if (!addr) throw new Error("denied");
  return addr;
}

type Wallet = {
  addr: string;
  state: WalletState;
  connect: () => Promise<void>;
};

function useWallet(fn: () => Promise<string>): Wallet {
  const [addr, setAddr] = useState("");
  const [state, setState] = useState<WalletState>("idle");
  const connect = useCallback(async () => {
    setState("connecting");
    try {
      const a = await fn();
      setAddr(a);
      setState("connected");
    } catch (e) {
      setState(e instanceof Error && e.message === "missing" ? "missing" : "error");
    }
  }, [fn]);
  return { addr, state, connect };
}

const LABELS: Record<WalletState, string> = {
  idle: "",
  connecting: "Connecting…",
  connected: "",
  missing: "Not installed",
  error: "Try again",
};

function WalletChip({
  name,
  chain,
  glyph,
  wallet,
}: {
  name: string;
  chain: string;
  glyph: "eth" | "xlm";
  wallet: Wallet;
}) {
  const { addr, state, connect } = wallet;
  if (state === "connected") {
    return (
      <div className="wallet-chip connected">
        <span className={`glyph ${glyph}`} aria-hidden="true" />
        <span className="wallet-name">{chain}</span>
        <span className="wallet-addr mono">{truncate(addr)}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="wallet-chip"
      onClick={connect}
      disabled={state === "connecting"}
    >
      <span className={`glyph ${glyph}`} aria-hidden="true" />
      <span className="wallet-name">
        {state === "idle" ? `Connect ${name}` : `${name}`}
      </span>
      {LABELS[state] && <span className="wallet-hint">{LABELS[state]}</span>}
    </button>
  );
}

export function WalletBar() {
  const eth = useWallet(connectMetaMask);
  const xlm = useWallet(connectFreighter);
  return (
    <div className="wallet-bar" role="group" aria-label="Wallets">
      <WalletChip name="MetaMask" chain="Sepolia" glyph="eth" wallet={eth} />
      <WalletChip name="Freighter" chain="Stellar" glyph="xlm" wallet={xlm} />
    </div>
  );
}
