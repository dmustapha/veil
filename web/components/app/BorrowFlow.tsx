"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { SealByteGrid } from "@/components/SealByteGrid";
import { useWallets } from "./WalletContext";
import { TxLink, Notice } from "./ui";
import { startProve, checkProve } from "@/lib/app/prove";
import { borrow } from "@/lib/app/stellar";
import { updatePosition, type StoredPosition } from "@/lib/app/positions";
import { stellarTxUrl } from "@/lib/app/format";
import { ESCROW } from "@/lib/onchain";

type Phase = "idle" | "proving" | "borrowing" | "done" | "error";

export function BorrowFlow({
  pos,
  onBorrowed,
}: {
  pos: StoredPosition;
  onBorrowed: () => void;
}) {
  const { xlm } = useWallets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [tx, setTx] = useState(pos.borrowTx ?? "");
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (poll.current && clearTimeout(poll.current)), []);

  const runBorrow = useCallback(
    async (seal: string, journal: string) => {
      if (!xlm.address) return;
      setPhase("borrowing");
      setMessage("Confirm the borrow in Freighter…");
      try {
        const hash = await borrow(seal, journal, xlm.address);
        updatePosition(pos.h, { borrowTx: hash });
        setTx(hash);
        setPhase("done");
        onBorrowed();
      } catch (e) {
        setPhase("error");
        setMessage(e instanceof Error ? e.message : "The borrow failed.");
      }
    },
    [xlm.address, pos.h, onBorrowed]
  );

  const pollProof = useCallback(
    (id: string) => {
      const tick = async () => {
        const st = await checkProve(id);
        if (st.state === "ready") return runBorrow(st.seal, st.journal);
        if (st.state === "error") {
          setPhase("error");
          return setMessage(st.message);
        }
        setMessage(st.message ?? "Generating the proof off-chain. This takes a few minutes.");
        poll.current = setTimeout(tick, 5000);
      };
      void tick();
    },
    [runBorrow]
  );

  const start = async () => {
    if (xlm.status !== "connected" || !xlm.address) {
      setPhase("error");
      return setMessage("Connect Freighter on Stellar testnet to receive the loan.");
    }
    setPhase("proving");
    setMessage("Generating the proof off-chain. This takes a few minutes.");
    try {
      // Bind the proof to the connected Stellar account; the vault rejects redemption by any other.
      const { id } = await startProve(pos.h, ESCROW, xlm.address);
      pollProof(id);
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Could not start proving.");
    }
  };

  if (tx || phase === "done") {
    return (
      <Notice tone="ok">
        USDC borrowed on Stellar. <TxLink href={stellarTxUrl(tx)} label="View on Stellar Expert" />
      </Notice>
    );
  }

  const working = phase === "proving" || phase === "borrowing";
  return (
    <div className="borrow-flow">
      {working && (
        <div className="prove-stage">
          <SealByteGrid state="idle" />
          <p className="help proving-note">
            <span className="spin-lime" aria-hidden="true" /> {message}
          </p>
        </div>
      )}
      {phase === "error" && <Notice tone="error">{message}</Notice>}
      {!working && (
        <button className="btn btn-primary" type="button" onClick={start}>
          <Coins aria-hidden="true" /> Borrow USDC
        </button>
      )}
    </div>
  );
}
