"use client";

import { formatEther } from "viem";
import { FrostedVeil } from "@/components/FrostedVeil";
import { BorrowFlow } from "./BorrowFlow";
import { ContinueOpen } from "./ContinueOpen";
import { UseUsdc } from "./UseUsdc";
import { TxLink } from "./ui";
import { truncate, ethTxUrl, stellarTxUrl } from "@/lib/app/format";
import { POSITION } from "@/lib/constants";
import type { NoteStatus, VeilNote } from "@/lib/app/notes";

const PILL: Record<NoteStatus, string> = {
  created: "Opening",
  "locked-eth": "Attesting",
  attested: "Ready to borrow",
  "locked-note": "Borrowing",
  borrowed: "Borrowed",
};

/** A short 0x identifier for a note, derived from its (public) AVAILABLE commitment. */
const shortId = (dec: string) => truncate("0x" + BigInt(dec).toString(16).padStart(64, "0"), 10, 6);

export function NoteCard({ note, onChanged }: { note: VeilNote; onChanged: () => void }) {
  const canBorrow = note.status === "attested" || note.status === "locked-note";
  const borrowed = note.status === "borrowed";

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

        <FrostedVeil />

        <div className="pos-facts">
          <Fact k="Your collateral" v={`${formatEther(BigInt(note.amount))} ETH`} />
          <Fact k="Proven to Stellar" v={`≥ ${POSITION.thresholdEth}`} />
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
            </>
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
