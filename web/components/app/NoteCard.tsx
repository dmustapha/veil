"use client";

import { useEffect } from "react";
import { formatEther } from "viem";
import { FrostedVeil } from "@/components/FrostedVeil";
import { BorrowFlow } from "./BorrowFlow";
import { ContinueOpen } from "./ContinueOpen";
import { RepayFlow } from "./RepayFlow";
import { UseUsdc } from "./UseUsdc";
import { TxLink } from "./ui";
import { truncate, ethTxUrl, stellarTxUrl } from "@/lib/app/format";
import { backfillAttestTx } from "@/lib/app/pipeline";
import { POSITION } from "@/lib/constants";
import type { NoteStatus, VeilNote } from "@/lib/app/notes";

const PILL: Record<NoteStatus, string> = {
  created: "Opening",
  "locked-eth": "Attesting",
  attested: "Ready to borrow",
  "locked-note": "Borrowing",
  borrowed: "Borrowed",
  repaid: "Repaid",
  released: "Released",
};

/** A short 0x identifier for a note, derived from its (public) AVAILABLE commitment. */
const shortId = (dec: string) => truncate("0x" + BigInt(dec).toString(16).padStart(64, "0"), 10, 6);

export function NoteCard({ note, onChanged }: { note: VeilNote; onChanged: () => void }) {
  const canBorrow = note.status === "attested" || note.status === "locked-note";
  const borrowed = note.status === "borrowed";

  // If the relayer executed the attestation, our client never stored the Stellar attest tx. Backfill it
  // from Axelar on mount so the "Attest tx" proof row appears without waiting for the borrow step.
  useEffect(() => {
    if (note.executeTx || !note.lockTxEth) return;
    let live = true;
    backfillAttestTx(note).then((filled) => {
      if (live && filled) onChanged();
    });
    return () => {
      live = false;
    };
  }, [note.commitmentAvailable, note.executeTx, note.lockTxEth, note, onChanged]);

  return (
    <div className="card pos-card reveal">
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">Position</div>
            <div className="card-sub mono">{shortId(note.commitmentAvailable)}</div>
          </div>
          <span className={`pos-pill ${note.status}`}>{PILL[note.status]}</span>
        </div>

        <FrostedVeil sealed={note.status !== "created"} />

        <div className="pos-facts">
          <Fact k="Your collateral" v={`${formatEther(BigInt(note.amount))} ETH`} />
          {note.status === "created" ? (
            <Fact k="Status" v="Not locked yet" />
          ) : (
            <Fact k="Proven to Stellar" v="Threshold cleared" />
          )}
          <Fact k="Collateral chain" v={POSITION.collateralChain} />
          <Fact k="Lending chain" v={POSITION.lendingChain} />
          {note.lockTxEth && (
            <Fact k="Lock tx" v={<TxLink href={ethTxUrl(note.lockTxEth)} label={truncate(note.lockTxEth)} />} />
          )}
          {note.executeTx && (
            <Fact k="Attest tx" v={<TxLink href={stellarTxUrl(note.executeTx)} label={truncate(note.executeTx)} />} />
          )}
          {note.lockTx && (
            <Fact k="Spend tx" v={<TxLink href={stellarTxUrl(note.lockTx)} label={truncate(note.lockTx)} />} />
          )}
          {note.borrowTx && (
            <Fact k="Borrow tx" v={<TxLink href={stellarTxUrl(note.borrowTx)} label={truncate(note.borrowTx)} />} />
          )}
          {note.repayTx && (
            <Fact k="Repay tx" v={<TxLink href={stellarTxUrl(note.repayTx)} label={truncate(note.repayTx)} />} />
          )}
          {note.releaseTx && (
            <Fact k="Release tx" v={<TxLink href={stellarTxUrl(note.releaseTx)} label={truncate(note.releaseTx)} />} />
          )}
          {note.releaseEthTx && (
            <Fact k="WETH release tx" v={<TxLink href={ethTxUrl(note.releaseEthTx)} label={truncate(note.releaseEthTx)} />} />
          )}
        </div>

        <div className="pos-actions">
          {(note.status === "created" || note.status === "locked-eth") && (
            <ContinueOpen note={note} onChanged={onChanged} />
          )}
          {canBorrow && <BorrowFlow note={note} onBorrowed={onChanged} />}
          {borrowed && (
            <>
              <div className="pos-divider" />
              <div className="pos-sub-title">Use your USDC on Stellar</div>
              <UseUsdc />
              <div className="pos-divider" />
              <RepayFlow note={note} onRepaid={onChanged} />
            </>
          )}
          {note.status === "released" && (
            <div className="pos-terminal">
              WETH returned to Ethereum
            </div>
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
