"use client";

import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { useWallets } from "./WalletContext";
import { StepList, Notice } from "./ui";
import { BORROW_STEPS, runBorrowPipeline, type BorrowStepKey } from "@/lib/app/pipeline";
import type { VeilNote } from "@/lib/app/notes";

const BORROW_INDEX = new Map(BORROW_STEPS.map((s, i) => [s.key, i] as const));

/**
 * Completes an `attested` note: spends it into a LOCKED note, then proves it clears the public
 * threshold and disburses real USDC — every proof produced on the borrower's device (see pipeline.ts).
 */
export function BorrowFlow({ note, onBorrowed }: { note: VeilNote; onBorrowed: () => void }) {
  const { xlm } = useWallets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<BorrowStepKey | null>(null);

  const completed = useMemo(() => {
    const i = step ? BORROW_INDEX.get(step) ?? 0 : 0;
    return new Set(BORROW_STEPS.slice(0, i).map((s) => s.key));
  }, [step]);

  const start = async () => {
    setError("");
    if (xlm.status !== "connected" || !xlm.address) {
      return setError("Connect Freighter on Stellar testnet to receive the loan.");
    }
    setBusy(true);
    setStep(BORROW_STEPS[0].key);
    try {
      await runBorrowPipeline(note, { xlmAddress: xlm.address }, (key) => setStep(key));
      setStep(null);
      onBorrowed();
    } catch (e) {
      setError(e instanceof Error ? friendly(e.message) : "The borrow failed.");
      setStep(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="borrow-flow">
      {busy && <StepList steps={BORROW_STEPS} current={step} done={completed} />}
      {error && <Notice tone="error">{error}</Notice>}
      {!busy && (
        <button className="btn btn-primary" type="button" onClick={start}>
          <Coins aria-hidden="true" /> Borrow USDC
        </button>
      )}
    </div>
  );
}

function friendly(msg: string): string {
  if (/Signing was rejected|user rejected|denied/i.test(msg)) return "You rejected the transaction.";
  if (/below the threshold/i.test(msg)) return "This note is below the public threshold and cannot borrow.";
  if (/commitment not found|reconstruction incomplete/i.test(msg))
    return "The note isn't visible in the pool yet — give the attestation a moment and retry.";
  return msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
}
