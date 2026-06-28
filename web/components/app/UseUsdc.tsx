"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useWallets } from "./WalletContext";
import { TxLink, Notice } from "./ui";
import { sendUsdc } from "@/lib/app/stellar";
import { stellarTxUrl } from "@/lib/app/format";

const STELLAR_ADDR = /^G[A-Z2-7]{55}$/;

export function UseUsdc() {
  const { xlm } = useWallets();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");

  const validAddr = STELLAR_ADDR.test(to.trim());
  const validAmount = parseFloat(amount) > 0;

  const submit = async () => {
    setError("");
    setTx("");
    if (xlm.status !== "connected" || !xlm.address) {
      return setError("Connect Freighter on Stellar testnet first.");
    }
    if (!validAddr) return setError("Enter a valid Stellar address (starts with G).");
    if (!validAmount) return setError("Enter an amount above zero.");
    setBusy(true);
    try {
      const hash = await sendUsdc(xlm.address, to.trim(), amount.trim());
      setTx(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The transfer failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="use-usdc">
      <p className="help">
        Your borrowed USDC is real, transferable Circle USDC. Send some to any
        Stellar address to prove it.
      </p>
      <div className="app-form">
        <label className="app-field">
          <span className="app-label">Recipient Stellar address</span>
          <input
            className="app-input mono"
            type="text"
            placeholder="G…"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={busy}
            spellCheck={false}
            aria-label="Recipient Stellar address"
          />
        </label>
        <label className="app-field narrow">
          <span className="app-label">Amount (USDC)</span>
          <input
            className="app-input mono"
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            aria-label="Amount in USDC"
          />
        </label>
      </div>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={submit}
        disabled={busy || !validAddr || !validAmount}
      >
        {busy ? <span className="spin-lime" aria-hidden="true" /> : <Send aria-hidden="true" />}
        {busy ? "Confirm in Freighter…" : "Send USDC"}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
      {tx && (
        <Notice tone="ok">
          Sent. <TxLink href={stellarTxUrl(tx)} label="View on Stellar Expert" />
        </Notice>
      )}
    </div>
  );
}
