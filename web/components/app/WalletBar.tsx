"use client";

import { AlertTriangle, Wallet, Plus } from "lucide-react";
import { useWallets, type WalletStatus } from "./WalletContext";
import { truncate } from "@/lib/app/format";

/** Short status line under the wallet name for each connection state. */
const SUB: Record<WalletStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  missing: "Not installed",
  "wrong-network": "Wrong network",
  error: "Connection failed — retry",
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
  const badge = (
    <span className="wallet-ic" aria-hidden="true">
      <Wallet />
    </span>
  );

  // Connected — non-interactive summary with a truncated address chip.
  if (status === "connected" && address) {
    return (
      <div className={`wallet-chip ${glyph} connected`}>
        {badge}
        <span className="wallet-col">
          <span className="wallet-name">{name}</span>
          <span className="wallet-sub">
            <span className="wallet-status-dot" aria-hidden="true" />
            {chain} · Connected
          </span>
        </span>
        <span className="wallet-addr mono">{truncate(address)}</span>
      </div>
    );
  }

  // Wrong network — prompt to switch.
  if (status === "wrong-network") {
    return (
      <button
        type="button"
        className={`wallet-chip ${glyph} warn`}
        onClick={onFix ?? onConnect}
      >
        <span className="wallet-ic warn" aria-hidden="true">
          <AlertTriangle />
        </span>
        <span className="wallet-col">
          <span className="wallet-name">{name}</span>
          <span className="wallet-sub">Wrong network — switch to {chain}</span>
        </span>
        {address ? <span className="wallet-addr mono">{truncate(address)}</span> : null}
      </button>
    );
  }

  // Idle / connecting / missing / error — a real connect button.
  const connecting = status === "connecting";
  return (
    <button
      type="button"
      className={`wallet-chip ${glyph}`}
      onClick={onConnect}
      disabled={connecting}
    >
      {badge}
      <span className="wallet-col">
        <span className="wallet-name">{name}</span>
        <span className="wallet-sub">{SUB[status]}</span>
      </span>
      <span className="wallet-cta" aria-hidden="true">
        {connecting ? <span className="spin-lime" /> : <Plus />}
      </span>
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
