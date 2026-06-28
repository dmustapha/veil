"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { WalletProvider } from "./WalletContext";
import { WalletBar } from "./WalletBar";
import { OpenPosition } from "./OpenPosition";
import { PositionCard } from "./PositionCard";
import { PrivacyLedger } from "./PrivacyLedger";
import { CheatPlayground } from "./CheatPlayground";
import { loadPositions, type StoredPosition } from "@/lib/app/positions";

function Positions() {
  const [list, setList] = useState<StoredPosition[]>([]);
  const reload = useCallback(() => setList(loadPositions()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <div className="app-section-head reveal">
        <h2 className="app-h2">Your positions</h2>
        <p className="help">
          Each card reads the live escrow lock, the Soroban loan, and the
          Reflector price. The collateral amount is never shown, only the public
          threshold.
        </p>
      </div>

      <div className="open-row">
        <OpenPosition onCreated={reload} />
      </div>

      {list.length === 0 ? (
        <div className="empty reveal">
          <Inbox aria-hidden="true" />
          <p>No positions yet. Lock collateral above to open your first one.</p>
        </div>
      ) : (
        <div className="pos-grid">
          {list.map((p) => (
            <PositionCard key={p.h} pos={p} />
          ))}
        </div>
      )}
    </>
  );
}

export function AppWorkspace() {
  return (
    <WalletProvider>
      <section className="app-bar-wrap wrap reveal">
        <WalletBar />
      </section>
      <section className="wrap app-body">
        <Positions />
        <div className="app-section-head reveal" style={{ marginTop: 8 }}>
          <h2 className="app-h2">What Stellar sees</h2>
          <p className="help">
            The same loan, two ways: what a naive cross-chain design would publish
            versus what Veil&apos;s proof actually records. This is the privacy the
            ZK buys, made legible.
          </p>
        </div>
        <div className="reveal">
          <PrivacyLedger />
        </div>
        <div className="app-section-head reveal" style={{ marginTop: 8 }}>
          <h2 className="app-h2">Test the defense</h2>
        </div>
        <CheatPlayground />
      </section>
    </WalletProvider>
  );
}
