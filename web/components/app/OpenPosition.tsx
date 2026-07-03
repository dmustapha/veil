"use client";

import { useMemo, useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { useWallets } from "./WalletContext";
import { StepList, Notice } from "./ui";
import { createNote, saveNote } from "@/lib/app/notes";
import { OPEN_STEPS, parseCollateral, runOpenPipeline, type OpenStepKey } from "@/lib/app/pipeline";
import { PUBLIC_THRESHOLD_WEI } from "@/lib/onchain";
import { POSITION } from "@/lib/constants";

/** Index of a step key in the ordered OPEN_STEPS, for computing which steps are already done. */
const OPEN_INDEX = new Map(OPEN_STEPS.map((s, i) => [s.key, i] as const));

export function OpenPosition({ onCreated }: { onCreated: () => void }) {
  const { eth, xlm } = useWallets();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [step, setStep] = useState<OpenStepKey | null>(null);
  const [detail, setDetail] = useState("");

  const ethReady = eth.status === "connected" && !!eth.address;
  const xlmReady = xlm.status === "connected" && !!xlm.address;
  const ready = ethReady && xlmReady;
  const validAmount = parseFloat(amount) > 0;

  // Steps already completed = everything before the active step (skipped legs count as done).
  const completed = useMemo(() => {
    const i = step ? OPEN_INDEX.get(step) ?? 0 : done ? OPEN_STEPS.length : 0;
    return new Set(OPEN_STEPS.slice(0, i).map((s) => s.key));
  }, [step, done]);

  const submit = async () => {
    setError("");
    setDone(false);
    if (!eth.address) return setError("Connect MetaMask on Sepolia first.");
    if (!xlm.address) return setError("Connect Freighter on Stellar testnet to receive the note.");
    let wei: bigint;
    try {
      wei = parseCollateral(amount);
    } catch {
      return setError("Enter a valid ETH amount.");
    }
    if (wei < PUBLIC_THRESHOLD_WEI) return setError(`Lock at least ${POSITION.thresholdEth} to clear the threshold.`);

    setBusy(true);
    setStep(OPEN_STEPS[0].key);
    try {
      const note = createNote(wei);
      await saveNote(note);
      // Deliberately no reload yet: while this form drives the pipeline it owns the progress UI. The
      // note surfaces as a card only when we yield — on success, or on interruption (catch) so it can
      // be resumed there — which also prevents a second, concurrent open run from its card.
      await runOpenPipeline(
        note,
        { ethAccount: eth.address, xlmAddress: xlm.address },
        (key, d) => {
          setStep(key);
          setDetail(d ?? "");
        },
      );
      setStep(null);
      setDone(true);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? friendly(e.message) : "Something went wrong.");
      setStep(null);
      onCreated(); // surface the partially-opened note as a card so the user can resume it
    } finally {
      setBusy(false);
      setDetail("");
    }
  };

  return (
    <div className="card reveal">
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">Open a position</div>
            <div className="card-sub">Lock your own ETH on Sepolia; borrow against it privately on Stellar</div>
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
              You see this number; the Stellar side never will. The proof reveals only{" "}
              <b>≥ {POSITION.thresholdEth}</b>, never the exact figure or your address.
            </span>
          </label>
        </div>

        <button
          className="btn btn-primary app-cta"
          type="button"
          onClick={submit}
          disabled={busy || !ready || !validAmount}
        >
          {busy ? <span className="spin-lime" aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {busy ? "Working…" : "Lock collateral"}
          {!busy && <ArrowRight aria-hidden="true" />}
        </button>

        {busy && <StepList steps={OPEN_STEPS} current={step} done={completed} detail={detail} />}

        {!ready && (
          <Notice tone="info">
            Connect MetaMask on Sepolia and Freighter on Stellar testnet. This locks real test ETH and
            attests it across chains with Axelar.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {done && (
          <Notice tone="ok">
            Note created and attested on Stellar. Find it below to borrow against it.
          </Notice>
        )}
      </div>
    </div>
  );
}

function friendly(msg: string): string {
  if (/user rejected|denied|rejected the request|Signing was rejected/i.test(msg)) return "You rejected the transaction.";
  if (/insufficient funds/i.test(msg)) return "Not enough Sepolia ETH for this amount plus gas.";
  if (/timed out waiting for Axelar/i.test(msg)) return "Axelar is still confirming — reopen this note shortly to finish.";
  return msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
}
