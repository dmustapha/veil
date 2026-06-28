"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Hex } from "viem";
import {
  ensureSepolia,
  hasMetaMask,
  readChainId,
  requestAccounts,
} from "@/lib/app/eth";
import { connectFreighter, isTestnet } from "@/lib/app/stellar";
import { SEPOLIA_CHAIN_HEX } from "@/lib/onchain";

export type WalletStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "missing"
  | "wrong-network"
  | "error";

type EthWallet = {
  address: Hex | null;
  status: WalletStatus;
  connect: () => Promise<void>;
  fixNetwork: () => Promise<void>;
};
type XlmWallet = {
  address: string | null;
  network: string | null;
  status: WalletStatus;
  connect: () => Promise<void>;
};

const Ctx = createContext<{ eth: EthWallet; xlm: XlmWallet } | null>(null);

export function useWallets() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallets must be used within WalletProvider");
  return v;
}

function useEth(): EthWallet {
  const [address, setAddress] = useState<Hex | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");

  const refresh = useCallback(async () => {
    const onSepolia = (await readChainId()) === SEPOLIA_CHAIN_HEX;
    setStatus(onSepolia ? "connected" : "wrong-network");
  }, []);

  const connect = useCallback(async () => {
    if (!hasMetaMask()) return setStatus("missing");
    setStatus("connecting");
    try {
      const [acct] = await requestAccounts();
      setAddress((acct ?? null) as Hex | null);
      const onSepolia = await ensureSepolia();
      setStatus(onSepolia ? "connected" : "wrong-network");
    } catch {
      setStatus("error");
    }
  }, []);

  const fixNetwork = useCallback(async () => {
    setStatus("connecting");
    try {
      setStatus((await ensureSepolia()) ? "connected" : "wrong-network");
    } catch {
      setStatus("wrong-network");
    }
  }, []);

  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth?.on) return;
    const onAccts = (...a: unknown[]) => {
      const accts = a[0] as string[];
      setAddress((accts?.[0] ?? null) as Hex | null);
      if (!accts?.length) setStatus("idle");
    };
    const onChain = () => void refresh();
    eth.on("accountsChanged", onAccts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  return { address, status, connect, fixNetwork };
}

function useXlm(): XlmWallet {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const { address: a, network: n } = await connectFreighter();
      setAddress(a);
      setNetwork(n);
      setStatus(isTestnet(n) ? "connected" : "wrong-network");
    } catch (e) {
      setStatus(
        e instanceof Error && e.message === "missing" ? "missing" : "error"
      );
    }
  }, []);

  return { address, network, status, connect };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const eth = useEth();
  const xlm = useXlm();
  return <Ctx.Provider value={{ eth, xlm }}>{children}</Ctx.Provider>;
}
