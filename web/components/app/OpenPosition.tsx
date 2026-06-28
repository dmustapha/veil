"use client";

import { useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { useWallets } from "./WalletContext";
import { TxLink, Notice } from "./ui";
import { lockCollateral, newSecret } from "@/lib/app/eth";
import { addPosition } from "@/lib/app/positions";
import { ethTxUrl } from "@/lib/app/format";
import { POSITION } from "@/lib/constants";

const TERMS = [7, 14, 30];

export function OpenPosition({ onCreated }: { onCreated: () => void }) {
  const { eth } = useWallets();
  const [amount, setAmount] = useState("");
  const [termDays, setTermDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");

  const ready = eth.status === "connected" && eth.address;
  const validAmount = parseFloat(amount) > 0;

  const submit = async () => {
    setError("");
    setTx("");
    if (!ready || !eth.address) return setError("Connect MetaMask on Sepolia first.");
    if (!validAmount) return setError("Enter a collateral amount above zero.");
    setBusy(true);
    try {
      const { secret, h } = newSecret();
      const deadline = Math.floor(Date.now() / 1000) + termDays * 86400;
      const lockTx = await lockCollateral(eth.address, h, deadline, amount.trim());
      addPosition({
        h,
        secret,
        deadline,
        termDays,
        lockTx,
        createdAt: Date.now(),
      });
      setTx(lockTx);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? friendly(e.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card reveal">
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">Open a position</div>
            <div className="card-sub">Lock your own ETH on Sepolia under a private hashlock</div>
          </div>
          <span className="chain-tag">
            <span className="glyph eth" aria-hidden="true" /> Ethereum
          </span>
        </div>

        <div className="app-form">
          <label className="app-field">
            <span className="app-label">Collateral amount (ETH)</span>
            <input
              className="app-input mono"
              type="number"
              min="0"
              step="0.001"
              placeholder="e.g. 0.02"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              aria-label="Collateral amount in ETH"
            />
            <span className="help">
              You see this number; the Stellar side never will. It proves only{" "}
              <b>≥ {POSITION.thresholdEth}</b>, never the exact figure.
            </span>
          </label>

          <fieldset className="app-field">
            <legend className="app-label">Loan term</legend>
            <div className="seg" role="radiogroup" aria-label="Loan term">
              {TERMS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={termDays === d}
                  className={`seg-btn${termDays === d ? " on" : ""}`}
                  onClick={() => setTermDays(d)}
                  disabled={busy}
                >
                  {d} days
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          className="btn btn-primary app-cta"
          type="button"
          onClick={submit}
          disabled={busy || !ready || !validAmount}
        >
          {busy ? <span className="spin-lime" aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {busy ? "Confirm in MetaMask…" : "Lock collateral"}
          {!busy && <ArrowRight aria-hidden="true" />}
        </button>

        {!ready && (
          <Notice tone="info">
            Connect MetaMask on Sepolia to lock collateral. This sends a real
            transaction with your own test ETH.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {tx && (
          <Notice tone="ok">
            Collateral locked. <TxLink href={ethTxUrl(tx)} label="View on Etherscan" />
          </Notice>
        )}
      </div>
    </div>
  );
}

function friendly(msg: string): string {
  if (/user rejected|denied|rejected the request/i.test(msg)) return "You rejected the transaction.";
  if (/insufficient funds/i.test(msg)) return "Not enough Sepolia ETH for this amount plus gas.";
  if (/AlreadyUsed/i.test(msg)) return "That hashlock was already used. Try again to generate a fresh one.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
