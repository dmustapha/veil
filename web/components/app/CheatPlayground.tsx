"use client";

import { useState } from "react";
import { ShieldAlert, XCircle } from "lucide-react";
import type { CheatResponse } from "@/lib/api-types";
import { SealByteGrid } from "@/components/SealByteGrid";

export function CheatPlayground() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CheatResponse | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setRes(null);
    try {
      const r = (await fetch("/api/cheat").then((x) => x.json())) as CheatResponse;
      setRes(r);
    } catch {
      setRes(null);
    } finally {
      setBusy(false);
    }
  };

  const forged = !!res?.rejected;
  return (
    <div className="card cheat-play reveal">
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">Try a fake proof</div>
            <div className="card-sub">Tamper with the proof and watch it shatter — the trap the vault produced on-chain</div>
          </div>
          <span className="chain-tag">
            <span className="glyph xlm" aria-hidden="true" /> Soroban
          </span>
        </div>

        <p className="help">
          This flips one byte inside the real 256-byte Groth16 proof. On-chain,
          the vault rejects a tampered proof: a real one locks lime, a forged one
          shatters and nothing moves.
        </p>

        <SealByteGrid state={forged ? "forged" : "idle"} />

        <button className="btn btn-danger" type="button" onClick={run} disabled={busy}>
          {busy ? <span className="spin" aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
          {busy ? "Checking…" : "Try a fake proof"}
        </button>

        {res && (
          <div className="cheat-out" role="status" aria-live="polite">
            <div className="cheat-tag">
              <XCircle aria-hidden="true" /> Rejected on Stellar
              {res.source === "cached" && <span className="cached-flag">cached</span>}
            </div>
            <div className="cheat-code mono">{res.code}</div>
            <div className="cheat-reason mono">{res.reason}</div>
            <p className="help">
              No USDC moves. The proof gates the money, so tampering changes
              nothing. Re-spending a note is rejected too:{" "}
              <span className="mono">{res.replayCode}</span>. One note, one loan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
