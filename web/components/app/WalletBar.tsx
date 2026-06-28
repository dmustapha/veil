"use client";

import { AlertTriangle } from "lucide-react";
import { useWallets, type WalletStatus } from "./WalletContext";
import { truncate } from "@/lib/app/format";

const HINT: Record<WalletStatus, string> = {
  idle: "",
  connecting: "Connecting…",
  connected: "",
  missing: "Not installed",
  "wrong-network": "Wrong network",
  error: "Try again",
};

function Chip({
  name,
  chain,
  glyph,
  status,
  address,
  onConnect,
  onFix,
}: {
  name: string;
  chain: string;
  glyph: "eth" | "xlm";
  status: WalletStatus;
  address: string | null;
  onConnect: () => void;
  onFix?: () => void;
}) {
  if (status === "connected" && address) {
    return (
      <div className="wallet-chip connected">
        <span className={`glyph ${glyph}`} aria-hidden="true" />
        <span className="wallet-name">{chain}</span>
        <span className="wallet-addr mono">{truncate(address)}</span>
      </div>
    );
  }
  if (status === "wrong-network") {
    return (
      <button type="button" className="wallet-chip warn" onClick={onFix ?? onConnect}>
        <AlertTriangle aria-hidden="true" />
        <span className="wallet-name">{chain}: switch network</span>
        <span className="wallet-hint">{address ? truncate(address) : ""}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="wallet-chip"
      onClick={onConnect}
      disabled={status === "connecting"}
    >
      <span className={`glyph ${glyph}`} aria-hidden="true" />
      <span className="wallet-name">
        {status === "idle" ? `Connect ${name}` : name}
      </span>
      {HINT[status] && <span className="wallet-hint">{HINT[status]}</span>}
    </button>
  );
}

export function WalletBar() {
  const { eth, xlm } = useWallets();
  return (
    <div className="wallet-bar" role="group" aria-label="Wallets">
      <Chip
        name="MetaMask"
        chain="Sepolia"
        glyph="eth"
        status={eth.status}
        address={eth.address}
        onConnect={eth.connect}
        onFix={eth.fixNetwork}
      />
      <Chip
        name="Freighter"
        chain="Stellar"
        glyph="xlm"
        status={xlm.status}
        address={xlm.address}
        onConnect={xlm.connect}
      />
    </div>
  );
}
