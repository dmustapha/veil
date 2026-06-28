"use client";

import { useCallback, useEffect, useState } from "react";
import type { PositionResponse } from "@/lib/api-types";
import { FrostedVeil } from "@/components/FrostedVeil";
import { BorrowFlow } from "./BorrowFlow";
import { RepayFlow } from "./RepayFlow";
import { UseUsdc } from "./UseUsdc";
import { TxLink } from "./ui";
import { truncate, ethTxUrl, maxLtv, dueDate } from "@/lib/app/format";
import type { StoredPosition } from "@/lib/app/positions";

type Status = "open" | "active" | "repaid" | "defaulted";

const PILL: Record<Status, string> = {
  open: "Open",
  active: "Active loan",
  repaid: "Repaid",
  defaulted: "Defaulted",
};

function deriveStatus(data: PositionResponse | null, pos: StoredPosition): Status {
  const loan = data?.loan;
  if (loan?.defaulted) return "defaulted";
  if (loan?.repaid || pos.repayTx) return "repaid";
  if (loan || pos.borrowTx) return "active";
  return "open";
}

export function PositionCard({ pos }: { pos: StoredPosition }) {
  const [data, setData] = useState<PositionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/position?h=${pos.h}`);
      if (res.ok) setData((await res.json()) as PositionResponse);
    } catch {
      /* keep last known */
    } finally {
      setLoading(false);
    }
  }, [pos.h]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = deriveStatus(data, pos);
  const loan = data?.loan ?? null;
  const ltv =
    loan && data
      ? maxLtv(loan.principalUsdc, loan.thresholdWei, data.price.usd)
      : null;

  return (
    <div className="card pos-card reveal">
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">Position</div>
            <div className="card-sub mono">{truncate(pos.h, 10, 6)}</div>
          </div>
          <span className={`pos-pill ${status}`}>{PILL[status]}</span>
        </div>

        <FrostedVeil />

        <div className="pos-facts">
          <Fact k="Lock" v={data?.lock?.closed ? "Sealed" : data?.lock?.locked ? "Open" : loading ? "…" : "Not found"} />
          <Fact k="Principal" v={loan ? `${loan.principalUsdc} USDC` : status === "active" ? "settling…" : "n/a"} />
          <Fact k="Max LTV vs floor" v={ltv != null ? `${ltv.toFixed(1)}%` : "n/a"} />
          <Fact k="ETH price" v={data ? `$${data.price.usd}` : "…"} />
          <Fact k="Term ends" v={dueDate(pos.deadline)} />
          <Fact k="Lock tx" v={<TxLink href={ethTxUrl(pos.lockTx)} label={truncate(pos.lockTx)} />} />
        </div>

        <div className="pos-actions">
          {status === "open" && <BorrowFlow pos={pos} onBorrowed={refresh} />}
          {(status === "active" || status === "repaid") && (
            <>
              <RepayFlow pos={pos} onChanged={refresh} />
              <div className="pos-divider" />
              <div className="pos-sub-title">Use your USDC on Stellar</div>
              <UseUsdc />
            </>
          )}
          {status === "defaulted" && (
            <p className="help">
              The loan term passed. Collateral is claimable by the lender on
              Ethereum via the escrow timeout.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="pos-fact">
      <span className="pf-k">{k}</span>
      <span className="pf-v">{v}</span>
    </div>
  );
}
