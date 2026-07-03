"use client";

import { useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { useWallets } from "./WalletContext";
import { StepList, Notice } from "./ui";
import { REPAY_STEPS, runRepayPipeline, type RepayStepKey } from "@/lib/app/pipeline";
import type { VeilNote } from "@/lib/app/notes";
import type { Hex } from "viem";

const REPAY_INDEX = new Map(REPAY_STEPS.map((s, i) => [s.key, i] as const));

/**
 * Drives a `borrowed` note through the full reverse leg: repay USDC on Stellar, prove
 * the release circuit on device, relay via Axelar, and recover WETH on Ethereum. Both
 * the Freighter (Stellar signer) and the MetaMask address (WETH recipient) must be connected.
 */
export function RepayFlow({ note, onRepaid }: { note: VeilNote; onRepaid: () => void }) {
  const { xlm, eth } = useWallets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<RepayStepKey | null>(null);
  const [detail, setDetail] = useState("");

  const completed = useMemo(() => {
    const i = step ? REPAY_INDEX.get(step) ?? 0 : 0;
    return new Set(REPAY_STEPS.slice(0, i).map((s) => s.key));
  }, [step]);

  const start = async () => {
    setError("");
    if (xlm.status !== "connected" || !xlm.address) {
      return setError("Connect Freighter on Stellar to repay.");
    }
    if (eth.status !== "connected" || !eth.address) {
      return setError("Connect MetaMask — your WETH releases to that address.");
    }
    setBusy(true);
    setStep(REPAY_STEPS[0].key);
    try {
      await runRepayPipeline(
        note,
        { xlmAddress: xlm.address, ethAccount: eth.address as Hex },
        (key, d) => {
          setStep(key);
          setDetail(d ?? "");
        },
      );
      setStep(null);
      onRepaid();
    } catch (e) {
      setError(e instanceof Error ? friendly(e.message) : "The repay failed.");
      setStep(null);
    } finally {
      setBusy(false);
      setDetail("");
    }
  };

  return (
    <div className="repay-flow">
      {busy && (
        <StepList
          steps={REPAY_STEPS}
          current={step}
          done={completed}
          detail={detail}
          waitKeys={["axelar", "released"]}
          waitText={
            <>
              <b>Relaying back to Ethereum can take a few minutes.</b> The release is already submitted —
              it&apos;s safe to leave; reopen the position later to finish recovering your WETH.
              {note.releaseTx ? (
                <>
                  {" "}
                  <a
                    className="tx-inline"
                    href={`https://testnet.axelarscan.io/gmp/${note.releaseTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Track or top up the message on Axelarscan
                  </a>
                  .
                </>
              ) : null}
            </>
          }
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!busy && (
        <button className="btn btn-primary" type="button" onClick={start}>
          <Undo2 aria-hidden="true" /> Repay &amp; release WETH
        </button>
      )}
    </div>
  );
}

function friendly(msg: string): string {
  if (/Signing was rejected|user rejected|denied/i.test(msg)) return "You rejected the transaction.";
  if (/release not yet confirmed|still in flight|Axelar hop/i.test(msg))
    return "The release is submitted; the Ethereum side takes a few minutes. Reopen to resume.";
  if (/below the threshold/i.test(msg)) return "This note is below the public threshold.";
  return msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
}
