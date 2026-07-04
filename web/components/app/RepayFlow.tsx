"use client";

import { useMemo, useState } from "react";
import { Undo2, Trash2 } from "lucide-react";
import { useWallets } from "./WalletContext";
import { StepList, Notice } from "./ui";
import { REPAY_STEPS, runRepayPipeline, type RepayStepKey } from "@/lib/app/pipeline";
import { removeNote, type VeilNote } from "@/lib/app/notes";
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
  const [orphaned, setOrphaned] = useState(false);

  const completed = useMemo(() => {
    const i = step ? REPAY_INDEX.get(step) ?? 0 : 0;
    return new Set(REPAY_STEPS.slice(0, i).map((s) => s.key));
  }, [step]);

  const start = async () => {
    setError("");
    setOrphaned(false);
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
      const raw = e instanceof Error ? e.message : "";
      // Both a missing position and a release-proof mismatch mean the note is stale (opened against an
      // earlier deployment) — offer Discard so it can be cleared and replaced with a fresh run.
      setOrphaned(/NO_POSITION|REPAID_TREE_MISMATCH|Assert Failed|Error in template|ReleaseRepaid/i.test(raw));
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
      {!busy && orphaned && (
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            await removeNote(note.commitmentAvailable);
            onRepaid();
          }}
        >
          <Trash2 aria-hidden="true" /> Discard this position
        </button>
      )}
      {!busy && (
        <button className="btn btn-primary" type="button" onClick={start}>
          <Undo2 aria-hidden="true" /> Repay &amp; release WETH
        </button>
      )}
    </div>
  );
}

function friendly(msg: string): string {
  if (/NO_POSITION/.test(msg))
    return "No active loan found for this position in the current lending pool. It was likely opened against an earlier deployment. Discard this one and open a fresh position to repay.";
  // The repaid tree is incremental and has no on-chain leaf history, so the release path is rebuilt from
  // this device's own repaid notes. If some of this vault's repayments happened on another device or URL,
  // the path can't be reconstructed here.
  if (/REPAID_TREE_MISMATCH/.test(msg))
    return "This position's repayment history was partly recorded on another device or URL, so its release proof can't be rebuilt here. Repay from the browser where the earlier positions were opened, or discard and run a fresh lock → borrow → repay.";
  // A residual circuit constraint failure after path reconstruction points to a note whose secrets or
  // tree position predate the current pool/circuits (opened against an earlier deployment).
  if (/Assert Failed|Error in template|ReleaseRepaid|not canonical|pathElements must be depth/i.test(msg))
    return "This position's release proof no longer matches the current pool. Discard it and run a fresh lock → borrow → repay to complete the round trip.";
  if (/Signing was rejected|user rejected|denied/i.test(msg)) return "You rejected the transaction.";
  if (/release not yet confirmed|still in flight|Axelar hop/i.test(msg))
    return "The release is submitted; the Ethereum side takes a few minutes. Reopen to resume.";
  if (/below the threshold/i.test(msg)) return "This note is below the public threshold.";
  return msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
}
