"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { useWallets } from "./WalletContext";
import { StepList, Notice } from "./ui";
import { OPEN_STEPS, runOpenPipeline, type OpenStepKey } from "@/lib/app/pipeline";
import { removeNote, type VeilNote } from "@/lib/app/notes";

const OPEN_INDEX = new Map(OPEN_STEPS.map((s, i) => [s.key, i] as const));

/**
 * Resume an interrupted open flow (a note stuck at `created`/`locked-eth`, e.g. the Axelar wait timed
 * out or the tab was closed mid-attestation). The pipeline is idempotent, so this safely picks up from
 * wherever the note left off — re-checking the live lock instead of re-locking.
 */
export function ContinueOpen({ note, onChanged }: { note: VeilNote; onChanged: () => void }) {
  const { eth, xlm } = useWallets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<OpenStepKey | null>(null);
  const [detail, setDetail] = useState("");

  // A `created` note never got on-chain — it's an unfinished draft (the lock failed or was interrupted
  // before broadcast), NOT an in-flight attestation. `locked-eth` means the WETH lock is confirmed and
  // only Axelar's cross-chain delivery is pending. The two states get honest, distinct framing.
  const locked = note.status === "locked-eth";

  const completed = useMemo(() => {
    const i = step ? OPEN_INDEX.get(step) ?? 0 : 0;
    return new Set(OPEN_STEPS.slice(0, i).map((s) => s.key));
  }, [step]);

  const resume = async () => {
    setError("");
    if (!eth.address) return setError("Connect MetaMask on Sepolia to continue.");
    if (!xlm.address) return setError("Connect Freighter on Stellar testnet to continue.");
    setBusy(true);
    setStep(OPEN_STEPS[0].key);
    try {
      await runOpenPipeline(note, { ethAccount: eth.address, xlmAddress: xlm.address }, (key, d) => {
        setStep(key);
        setDetail(d ?? "");
      });
      setStep(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 180) : "Could not continue.");
      setStep(null);
    } finally {
      setBusy(false);
      setDetail("");
    }
  };

  const discard = async () => {
    if (busy) return;
    await removeNote(note.commitmentAvailable);
    onChanged();
  };

  return (
    <div className="borrow-flow">
      <p className="help">
        {locked
          ? "This note is still being attested across chains. It becomes borrowable once Axelar delivers the lock to Stellar."
          : "This position isn’t locked yet — the Ethereum lock didn’t finish. Resume to lock your collateral, or discard this draft."}
      </p>
      {busy && (
        <StepList
          steps={OPEN_STEPS}
          current={step}
          done={completed}
          detail={detail}
          waitKeys={["attest"]}
          waitText={
            <>
              <b>Waiting for Ethereum to finalize the lock — this can take ~13 minutes.</b>{" "}
              It&apos;s safe to leave this page; the attestation resumes where it left off.
            </>
          }
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!busy && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" type="button" onClick={resume}>
            {locked ? "Continue attestation" : "Resume — lock collateral"}{" "}
            <ArrowRight aria-hidden="true" />
          </button>
          {!locked && (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={discard}
              aria-label="Discard this unfinished draft position"
            >
              <Trash2 aria-hidden="true" /> Discard
            </button>
          )}
        </div>
      )}
    </div>
  );
}
