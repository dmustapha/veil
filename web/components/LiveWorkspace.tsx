"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheatResponse, StateResponse } from "@/lib/api-types";
import { DEPLOYED, POSITION, PROOF } from "@/lib/constants";
import {
  CheckIcon,
  ExternalIcon,
  EyeOffIcon,
  LockIcon,
  ReplayIcon,
  WaitIcon,
  WarningIcon,
  XCircleIcon,
} from "./icons";
import { WalletBar } from "./wallets";

type StepStatus = "idle" | "active" | "done" | "fail";
type VerdictCls = "" | "verified" | "failed";
type RingKind = "wait" | "check" | "x";

const IDLE: StepStatus[] = ["idle", "idle", "idle", "idle"];

const STEPS = [
  {
    title: "Collateral sealed on Ethereum",
    body: (
      <>
        The escrow lock on Sepolia stays closed. The amount never leaves your
        wallet view.
      </>
    ),
  },
  {
    title: "Present the pre-generated seal",
    body: (
      <>
        Groth16 artifact, <span className="mono">260 bytes</span> · selector{" "}
        <span className="mono">{PROOF.sealSelector}</span>. Proving runs off-chain
        in minutes.
      </>
    ),
  },
  {
    title: "Verify on Stellar",
    body: <>A Soroban BN254 verifier checks the pairing on-chain. No relayer is trusted.</>,
  },
  {
    title: "USDC disbursed, amount stays hidden",
    body: <>Circle USDC lands against a threshold, never a revealed balance.</>,
  },
];

const reduceMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function LiveWorkspace() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>(IDLE);
  const [verdictCls, setVerdictCls] = useState<VerdictCls>("");
  const [ring, setRing] = useState<RingKind>("wait");
  const [vTitle, setVTitle] = useState("Awaiting verification");
  const [vSub, setVSub] = useState("Proof not yet submitted to Stellar");
  const [loan, setLoan] = useState("0.00");
  const [busy, setBusy] = useState(false);
  const [borrowedOnce, setBorrowedOnce] = useState(false);
  const [cheat, setCheat] = useState<CheatResponse | null>(null);
  const [cheatBusy, setCheatBusy] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafs = useRef<number[]>([]);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    rafs.current.forEach(cancelAnimationFrame);
    rafs.current = [];
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/state")
      .then((r) => r.json())
      .then((d: StateResponse) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const later = (fn: () => void, ms: number) =>
    timers.current.push(setTimeout(fn, ms));
  const setStep = (i: number, s: StepStatus) =>
    setSteps((p) => p.map((x, idx) => (idx === i ? s : x)));

  const target = data ? parseFloat(data.loan.principalUsdc) : POSITION.loanUsdc;

  const countUp = (to: number, ms: number) => {
    if (reduceMotion()) return setLoan(to.toFixed(2));
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setLoan((to * (1 - Math.pow(1 - t, 3))).toFixed(2));
      if (t < 1) rafs.current.push(requestAnimationFrame(frame));
      else setLoan(to.toFixed(2));
    };
    rafs.current.push(requestAnimationFrame(frame));
  };

  const resetFlow = () => {
    clearAll();
    setSteps(IDLE);
    setVerdictCls("");
    setRing("wait");
    setVTitle("Awaiting verification");
    setVSub("Proof not yet submitted to Stellar");
    setLoan("0.00");
    setCheat(null);
  };

  const runBorrow = () => {
    if (busy || cheatBusy) return;
    setBusy(true);
    resetFlow();
    const u = reduceMotion() ? 0 : 1;
    later(() => setStep(0, "active"), 60 * u);
    later(() => {
      setStep(0, "done");
      setStep(1, "active");
    }, 760 * u + 60);
    later(() => {
      setStep(1, "done");
      setStep(2, "active");
      setVTitle("Verifying on Stellar");
      setVSub("BN254 pairing check running on Soroban");
    }, 1500 * u + 80);
    later(() => {
      setStep(2, "done");
      setStep(3, "active");
      setVerdictCls("verified");
      setRing("check");
      setVTitle("Verified on Stellar");
      setVSub("Proof accepted, amount stays hidden");
      countUp(target, 1100);
    }, 2500 * u + 120);
    later(() => {
      setStep(3, "done");
      setBusy(false);
      setBorrowedOnce(true);
    }, 3700 * u + 200);
  };

  const runCheat = async () => {
    if (busy || cheatBusy) return;
    setCheatBusy(true);
    resetFlow();
    setStep(0, "done");
    setStep(1, "done");
    setStep(2, "active");
    setVTitle("Submitting forged proof");
    setVSub("Simulating against the live vault on Soroban");
    try {
      const res = (await fetch("/api/cheat").then((r) => r.json())) as CheatResponse;
      setStep(2, "fail");
      setVerdictCls("failed");
      setRing("x");
      setVTitle("Rejected on Stellar");
      setVSub("Pairing check failed, disbursement never ran");
      setLoan("0.00");
      setCheat(res);
    } catch {
      setCheat(null);
    } finally {
      setCheatBusy(false);
    }
  };

  const src = data?.source ?? null;
  const price = data ? `$${data.price.usd}` : POSITION.reflectorPrice;
  const ltv = data ? `${data.config.ltv}%` : POSITION.ltv;

  return (
    <section className="workspace wrap" id="flow">
      <div className="workspace-grid">
        {/* LEFT: live position + hidden amount */}
        <div className="card reveal d4">
          <div className="card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Live position</div>
                <div className="card-sub">
                  Reads from the deployed vault, oracle, and escrow
                </div>
              </div>
              <SourceBadge src={src} />
            </div>

            <div className="vault-pane">
              <div className="vault-label">
                <span>Collateral locked</span>
                <span className="lock-badge">
                  <LockIcon />
                  {data?.lock.closed ? "Sealed" : "Open"}
                </span>
              </div>
              <div className="redaction-stage">
                <div className="redaction-blocks" aria-hidden="true">
                  ▓▓▓▓▓▓
                </div>
                <div
                  className="frost"
                  role="img"
                  aria-label="Collateral amount is hidden by design"
                >
                  <span className="frost-glyph" aria-hidden="true">
                    <EyeOffIcon />
                  </span>
                  <span className="frost-text">hidden</span>
                </div>
              </div>
              <div className="vault-foot">
                <div className="threshold">
                  Proven <b>≥ {POSITION.thresholdEth}</b>{" "}
                  <span className="wei">(threshold · {POSITION.thresholdWei})</span>
                </div>
                <span className="public-only">
                  <CheckIcon width={13} height={13} />
                  Only the threshold is public
                </span>
              </div>
            </div>

            <div className="metrics">
              <Metric k="Reflector ETH price" v={price} sub="live oracle" />
              <Metric k="Loan to value" v={ltv} sub="conservative" />
              <Metric
                k="Loan disbursed"
                v={loan}
                sub="USDC"
                tone={verdictCls === "verified" ? "safe" : undefined}
              />
              <Metric
                k="Verifier"
                v={data ? "On-chain" : "Soroban"}
                sub="BN254 pairing"
              />
            </div>
          </div>
        </div>

        {/* RIGHT: wallets + borrow flow + verdict + cheat */}
        <div className="card reveal d5">
          <div className="card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Borrow workspace</div>
                <div className="card-sub">Lock on Ethereum, verify on Stellar</div>
              </div>
              <span className="chain-tag">
                <span className="glyph xlm" aria-hidden="true" /> Soroban
              </span>
            </div>

            <WalletBar />

            <div className="flow-steps">
              {STEPS.map((step, i) => (
                <div className={`step ${steps[i]}`} key={i}>
                  <div className="step-node">
                    {steps[i] === "done" ? (
                      <CheckIcon strokeWidth={2.6} />
                    ) : steps[i] === "fail" ? (
                      <XCircleIcon strokeWidth={2.6} />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div className="step-body">
                    <div className="st">{step.title}</div>
                    <div className="sd">{step.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`verdict ${verdictCls}`}>
              <div className="verdict-main">
                <div className="verdict-ring">
                  {ring === "check" ? (
                    <CheckIcon strokeWidth={2.4} />
                  ) : ring === "x" ? (
                    <XCircleIcon strokeWidth={2.4} />
                  ) : (
                    <WaitIcon />
                  )}
                </div>
                <div className="verdict-text">
                  <div className="vt">{vTitle}</div>
                  <div className="vs">{vSub}</div>
                </div>
              </div>
              <div className="verdict-amount">
                <div className="va" aria-live="polite">
                  {loan}
                </div>
                <div className="vl">USDC on Stellar</div>
              </div>
            </div>

            <div className="flow-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={runBorrow}
                disabled={busy || cheatBusy}
              >
                {borrowedOnce ? (
                  <ReplayIcon width={16} height={16} />
                ) : (
                  <CheckIcon width={16} height={16} />
                )}
                {borrowedOnce ? "Replay again" : "Replay verified borrow"}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={runCheat}
                disabled={busy || cheatBusy}
              >
                {cheatBusy ? (
                  <span className="spin" aria-hidden="true" />
                ) : (
                  <WarningIcon width={16} height={16} />
                )}
                {cheatBusy ? "Simulating…" : "Try the cheat (live)"}
              </button>
            </div>

            {borrowedOnce && !cheat && (
              <p className="flow-note">
                This replays the borrow that already settled on-chain. The proof
                is pre-generated off-chain and was verified live on Stellar.{" "}
                <a
                  className="tx-inline"
                  href={DEPLOYED.borrowTx.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View the real borrow transaction{" "}
                  <ExternalIcon width={12} height={12} />
                </a>
              </p>
            )}

            <CheatConsole cheat={cheat} />
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceBadge({ src }: { src: "live" | "cached" | null }) {
  if (!src) return <span className="source-badge loading">reading…</span>;
  return (
    <span className={`source-badge ${src}`}>
      <span className="live-dot" aria-hidden="true" />
      {src === "live" ? "Live on testnet" : "Cached values"}
    </span>
  );
}

function Metric({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub: string;
  tone?: "safe";
}) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className={`v ${tone === "safe" ? "safe" : ""}`}>
        <span>{v}</span> <small>{sub}</small>
      </div>
    </div>
  );
}

function CheatConsole({ cheat }: { cheat: CheatResponse | null }) {
  return (
    <div
      className={`err-console ${cheat ? "show" : ""}`}
      role="status"
      aria-live="polite"
    >
      {cheat && (
        <div className="err-inner">
          <div className="err-tag">
            <XCircleIcon className="x" /> Verification rejected on Stellar
            {cheat.source === "cached" && (
              <span className="cached-flag">cached</span>
            )}
          </div>
          <div className="err-code mono">{cheat.code}</div>
          <div className="err-reason mono">{cheat.reason}</div>
          <div className="err-note">
            <b>No USDC moves.</b> The proof gates the money; tampering changes
            nothing.
          </div>
          <div className="err-replay">
            Replaying a valid proof is rejected too:{" "}
            <span className="mono">{cheat.replayCode}</span>. One lock, one loan.
          </div>
        </div>
      )}
    </div>
  );
}
