"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { Unlock } from "lucide-react";
import { useWallets } from "./WalletContext";
import { TxLink, Notice } from "./ui";
import { repay } from "@/lib/app/stellar";
import { claimRepaid } from "@/lib/app/eth";
import { updatePosition, type StoredPosition } from "@/lib/app/positions";
import { ethTxUrl, stellarTxUrl } from "@/lib/app/format";

type Phase = "idle" | "repaying" | "claiming" | "done" | "error";

export function RepayFlow({
  pos,
  onChanged,
}: {
  pos: StoredPosition;
  onChanged: () => void;
}) {
  const { eth, xlm } = useWallets();
  const [phase, setPhase] = useState<Phase>(pos.repayTx ? "claiming" : "idle");
  const [message, setMessage] = useState("");
  const [repayTx, setRepayTx] = useState(pos.repayTx ?? "");
  const [claimTx, setClaimTx] = useState(pos.claimTx ?? "");

  const doRepay = async () => {
    if (xlm.status !== "connected" || !xlm.address) {
      setPhase("error");
      return setMessage("Connect Freighter on Stellar testnet to repay.");
    }
    setPhase("repaying");
    setMessage("Confirm the repay in Freighter…");
    try {
      const hash = await repay(pos.h, pos.secret, xlm.address);
      updatePosition(pos.h, { repayTx: hash });
      setRepayTx(hash);
      setPhase("claiming");
      setMessage("");
      onChanged();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "The repay failed.");
    }
  };

  const doClaim = async () => {
    if (eth.status !== "connected" || !eth.address) {
      setPhase("error");
      return setMessage("Connect MetaMask on Sepolia to unlock the collateral.");
    }
    setPhase("claiming");
    setMessage("Confirm the unlock in MetaMask…");
    try {
      const hash = await claimRepaid(eth.address, pos.secret as Hex);
      updatePosition(pos.h, { claimTx: hash });
      setClaimTx(hash);
      setPhase("done");
      setMessage("");
      onChanged();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "The unlock failed.");
    }
  };

  const busy = phase === "repaying" || (phase === "claiming" && !!message);
  return (
    <div className="repay-flow">
      {!repayTx ? (
        <button className="btn btn-ghost" type="button" onClick={doRepay} disabled={busy}>
          {busy ? <span className="spin-lime" aria-hidden="true" /> : <Unlock aria-hidden="true" />}
          Repay on Stellar
        </button>
      ) : (
        <Notice tone="ok">
          Repaid on Stellar. <TxLink href={stellarTxUrl(repayTx)} label="View repay tx" />
        </Notice>
      )}

      {repayTx && !claimTx && (
        <>
          <button className="btn btn-primary" type="button" onClick={doClaim} disabled={busy}>
            {busy ? <span className="spin-lime" aria-hidden="true" /> : <Unlock aria-hidden="true" />}
            Unlock collateral on Ethereum
          </button>
          <p className="help">
            This reveals your secret on Ethereum to release the collateral. The
            secret relayer can also do this step for you once it surfaces on Stellar.
          </p>
        </>
      )}

      {claimTx && (
        <Notice tone="ok">
          Collateral unlocked. <TxLink href={ethTxUrl(claimTx)} label="View unlock tx" />
        </Notice>
      )}
      {phase === "error" && <Notice tone="error">{message}</Notice>}
    </div>
  );
}
