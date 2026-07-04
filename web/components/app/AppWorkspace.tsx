"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Lock } from "lucide-react";
import { WalletProvider } from "./WalletContext";
import { WalletBar } from "./WalletBar";
import { OpenPosition } from "./OpenPosition";
import { NoteCard } from "./NoteCard";
import { Notice } from "./ui";
import { clearAllNotes, hasStoredNotes, isVaultUnlocked, loadNotes, unlockVault, type VeilNote } from "@/lib/app/notes";

/**
 * Gate the workspace behind the note vault's passphrase. Notes are AES-GCM encrypted on this device
 * (audit M-01); their opening secrets ARE the spend witness, so nothing loads until the session key is
 * derived. The passphrase never leaves the browser.
 */
function VaultGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [returning, setReturning] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUnlocked(isVaultUnlocked());
    setReturning(hasStoredNotes());
  }, []);

  const submit = async () => {
    setError("");
    if (passphrase.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    try {
      await unlockVault(passphrase);
      setPassphrase("");
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error && /incorrect passphrase/.test(e.message) ? "Incorrect passphrase." : "Could not unlock.");
    } finally {
      setBusy(false);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="card reveal vault-gate">
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">{returning ? "Unlock your positions" : "Set up your vault"}</div>
            <div className="card-sub">
              {returning
                ? "You have positions saved and encrypted on this device — enter your passphrase to unlock them."
                : "Encrypted on this device — the passphrase never leaves your browser"}
            </div>
          </div>
          <span className="chain-tag">
            <Lock aria-hidden="true" /> Local
          </span>
        </div>
        {returning && (
          <Notice tone="info">
            Your positions aren’t lost — they’re sealed behind this passphrase. Enter the same one you
            set earlier to bring them back.
          </Notice>
        )}
        <div className="app-form">
          <label className="app-field">
            <span className="app-label">Passphrase</span>
            <input
              className="app-input mono"
              type="password"
              placeholder="at least 8 characters"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
              disabled={busy}
              aria-label="Vault passphrase"
              autoComplete="current-password"
            />
            <span className="help">
              {returning
                ? "Enter the passphrase you set earlier to decrypt your saved positions on this device."
                : "First time here? Choose a passphrase (8+ characters) to encrypt your positions on this device."}
            </span>
          </label>
        </div>
        <button className="btn btn-primary app-cta" type="button" onClick={submit} disabled={busy || passphrase.length < 8}>
          {busy ? <span className="spin-lime" aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {busy ? "Unlocking…" : returning ? "Unlock" : "Create vault"}
        </button>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </div>
  );
}

function Positions() {
  const [list, setList] = useState<VeilNote[]>([]);
  const reload = useCallback(() => {
    void loadNotes().then(setList);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <div className="app-section-head reveal">
        <h2 className="app-h2">Your positions</h2>
        <p className="help">
          Lock ETH on Ethereum, prove it across chains, and borrow real USDC on Stellar — the exact
          amount and your address stay on your device. Only the public threshold is ever shown.
        </p>
      </div>

      <div className="open-row">
        <OpenPosition onCreated={reload} />
      </div>

      {(() => {
        // A position is DONE once the collateral is back on Ethereum (status "released"): the full
        // round trip is complete, so it moves out of the active view into History. Everything else
        // (opening, attesting, borrowable, borrowed, repaying) stays active where it's actionable.
        const active = list.filter((n) => n.status !== "released");
        const history = list.filter((n) => n.status === "released");
        return (
          <>
            {active.length === 0 && history.length === 0 ? (
              <div className="empty reveal">
                <Inbox aria-hidden="true" />
                <p>No positions yet. Lock collateral above to open your first one.</p>
              </div>
            ) : active.length === 0 ? (
              <div className="empty reveal">
                <Inbox aria-hidden="true" />
                <p>No active positions. Lock collateral above to open a new one.</p>
              </div>
            ) : (
              <div className="pos-grid">
                {active.map((n) => (
                  <NoteCard key={n.commitmentAvailable} note={n} onChanged={reload} />
                ))}
              </div>
            )}

            {history.length > 0 && (
              <div className="history-block reveal">
                <div className="app-section-head">
                  <h2 className="app-h2">History</h2>
                  <p className="help">
                    Completed round trips: collateral locked, borrowed against privately, repaid, and
                    released back to Ethereum. Every proof is on-chain.
                  </p>
                </div>
                <div className="pos-grid">
                  {history.map((n) => (
                    <NoteCard key={n.commitmentAvailable} note={n} onChanged={reload} />
                  ))}
                </div>
              </div>
            )}

            {list.length > 0 && (
              <div className="reset-row reveal">
                <button
                  className="reset-link"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Clear all positions stored on this device? On-chain state is untouched; this only removes them from this browser.")) {
                      clearAllNotes();
                      window.location.reload();
                    }
                  }}
                >
                  Clear all local positions
                </button>
              </div>
            )}
          </>
        );
      })()}
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
        <VaultGate>
          <Positions />
        </VaultGate>
      </section>
    </WalletProvider>
  );
}
