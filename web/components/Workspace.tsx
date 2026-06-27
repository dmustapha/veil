"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POSITION, PROOF } from "@/lib/constants";
import {
  CheckIcon,
  EyeOffIcon,
  LockIcon,
  ReplayIcon,
  WaitIcon,
  WarningIcon,
  XCircleIcon,
} from "./icons";

type StepStatus = "idle" | "active" | "done" | "fail";
type VerdictCls = "" | "verified" | "failed";
type RingKind = "wait" | "check" | "x";

const TARGET = POSITION.loanUsdc; // 1.97
const BAL_START = POSITION.balanceStart; // 0.93
const BAL_END = POSITION.balanceEnd; // 2.90

const STEPS = [
  {
    title: "Lock collateral on Ethereum",
    body: (
      <>
        MetaMask signs the escrow on Sepolia. The amount never leaves your wallet
        view.
      </>
    ),
  },
  {
    title: "Present the sealed proof",
    body: (
      <>
        Pre-generated Groth16 artifact, <span className="mono">260 bytes</span> ·
        seal <span className="mono">{PROOF.sealSelector}</span>
      </>
    ),
  },
  {
    title: "Verify on Stellar",
    body: (
      <>
        A Soroban BN254 verifier checks the pairing on-chain. No relayer is
        trusted.
      </>
    ),
  },
  {
    title: "USDC disbursed, amount stays hidden",
    body: (
      <>
        Circle USDC lands on Stellar against a threshold, never a revealed
        balance.
      </>
    ),
  },
];

const IDLE_STEPS: StepStatus[] = ["idle", "idle", "idle", "idle"];

export function Workspace() {
  const [steps, setSteps] = useState<StepStatus[]>(IDLE_STEPS);
  const [verdictCls, setVerdictCls] = useState<VerdictCls>("");
  const [ring, setRing] = useState<RingKind>("wait");
  const [vTitle, setVTitle] = useState("Awaiting verification");
  const [vSub, setVSub] = useState("Proof not yet submitted to Stellar");
  const [vAmount, setVAmount] = useState("0.00");
  const [loan, setLoan] = useState("0.00");
  const [balance, setBalance] = useState(BAL_START.toFixed(2));
  const [errShown, setErrShown] = useState(false);
  const [borrowedOnce, setBorrowedOnce] = useState(false);
  const [busy, setBusy] = useState(false);

  const runningRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number[]>([]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    rafRef.current.forEach(cancelAnimationFrame);
    rafRef.current = [];
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  const setStep = (i: number, status: StepStatus) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? status : s)));

  const resetUI = () => {
    clearAll();
    setSteps(IDLE_STEPS);
    setVerdictCls("");
    setRing("wait");
    setVTitle("Awaiting verification");
    setVSub("Proof not yet submitted to Stellar");
    setVAmount("0.00");
    setLoan("0.00");
    setBalance(BAL_START.toFixed(2));
    setErrShown(false);
  };

  const countUp = (
    from: number,
    to: number,
    ms: number,
    render: (v: number) => void,
    reduce: boolean,
    done?: () => void
  ) => {
    if (reduce) {
      render(to);
      done?.();
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      render(from + (to - from) * eased);
      if (t < 1) rafRef.current.push(requestAnimationFrame(frame));
      else done?.();
    };
    rafRef.current.push(requestAnimationFrame(frame));
  };

  const reduceMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const runBorrow = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    resetUI();
    const reduce = reduceMotion();
    const unit = reduce ? 0 : 1;

    later(() => setStep(0, "active"), 60 * unit);
    later(() => {
      setStep(0, "done");
      setStep(1, "active");
    }, 760 * unit + 60);

    later(() => {
      setStep(1, "done");
      setStep(2, "active");
      setVTitle("Verifying on Stellar");
      setVSub("BN254 pairing check running on Soroban");
    }, 1500 * unit + 80);

    later(() => {
      setStep(2, "done");
      setStep(3, "active");
      setVerdictCls("verified");
      setRing("check");
      setVTitle("Verified on Stellar");
      setVSub("Proof accepted, amount stays hidden");

      countUp(
        0,
        TARGET,
        1100,
        (v) => {
          setLoan(v.toFixed(2));
          setVAmount(v.toFixed(2));
        },
        reduce,
        () => {
          setLoan(TARGET.toFixed(2));
          setVAmount(TARGET.toFixed(2));
        }
      );
      countUp(
        BAL_START,
        BAL_END,
        1100,
        (v) => setBalance(v.toFixed(2)),
        reduce
      );
    }, 2500 * unit + 120);

    later(() => {
      setStep(3, "done");
      runningRef.current = false;
      setBusy(false);
      setBorrowedOnce(true);
    }, 3650 * unit + 200);
  };

  const runCheat = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    resetUI();
    const unit = reduceMotion() ? 0 : 1;

    later(() => setStep(0, "active"), 60 * unit);
    later(() => {
      setStep(0, "done");
      setStep(1, "active");
    }, 600 * unit + 60);
    later(() => {
      setStep(1, "done");
      setStep(2, "active");
      setVTitle("Verifying forged proof");
      setVSub("BN254 pairing check running on Soroban");
    }, 1200 * unit + 80);

    later(() => {
      setStep(2, "fail");
      setVerdictCls("failed");
      setRing("x");
      setVTitle("Rejected on Stellar");
      setVSub("Pairing check failed, disbursement never ran");
      setVAmount("0.00");
      setLoan("0.00");
      setBalance(BAL_START.toFixed(2));
      setErrShown(true);
      runningRef.current = false;
      setBusy(false);
    }, 2050 * unit + 120);
  };

  return (
    <section className="workspace wrap" id="flow">
      <div className="workspace-grid">
        {/* LEFT: position + hidden amount (signature element) */}
        <div className="card reveal d4">
          <div className="card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Demo position</div>
                <div className="card-sub">
                  Collateral on Ethereum · loan on Stellar
                </div>
              </div>
              <span className="chain-tag">
                <span className="glyph eth" aria-hidden="true" /> Sepolia
              </span>
            </div>

            <div className="vault-pane">
              <div className="vault-label">
                <span>Collateral locked</span>
                <span className="lock-badge">
                  <LockIcon />
                  Sealed
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
                  <span className="wei">
                    (threshold · {POSITION.thresholdWei})
                  </span>
                </div>
                <span className="public-only">
                  <CheckIcon width={13} height={13} />
                  Only the threshold is public
                </span>
              </div>
            </div>

            <div className="metrics">
              <div className="metric">
                <div className="k">Reflector ETH price</div>
                <div className="v">
                  {POSITION.reflectorPrice} <small>live oracle</small>
                </div>
              </div>
              <div className="metric">
                <div className="k">Loan to value</div>
                <div className="v">
                  {POSITION.ltv} <small>conservative</small>
                </div>
              </div>
              <div className="metric">
                <div className="k">Loan disbursed</div>
                <div className="v safe">
                  <span>{loan}</span> <small>USDC</small>
                </div>
              </div>
              <div className="metric">
                <div className="k">Balance after</div>
                <div className="v">
                  {balance} <small>USDC</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: borrow flow + verdict + actions */}
        <div className="card reveal d5">
          <div className="card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Borrow flow</div>
                <div className="card-sub">Lock on Ethereum, verify on Stellar</div>
              </div>
              <span className="chain-tag">
                <span className="glyph xlm" aria-hidden="true" /> Soroban
              </span>
            </div>

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
                  {vAmount}
                </div>
                <div className="vl">USDC on Stellar</div>
              </div>
            </div>

            <div className="flow-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={runBorrow}
                disabled={busy}
              >
                {borrowedOnce ? <ReplayIcon width={16} height={16} /> : (
                  <CheckIcon width={16} height={16} />
                )}
                {borrowedOnce ? "Run again" : "Borrow"}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={runCheat}
                disabled={busy}
              >
                <WarningIcon width={16} height={16} />
                Try the cheat
              </button>
            </div>

            <div
              className={`err-console ${errShown ? "show" : ""}`}
              role="status"
              aria-live="polite"
            >
              <div className="err-inner">
                <div className="err-tag">
                  <XCircleIcon className="x" /> Verification rejected on Stellar
                </div>
                <div className="err-code mono">Error(Crypto, InvalidInput)</div>
                <div className="err-reason mono">
                  bn254 G2: point not on curve
                </div>
                <div className="err-note">
                  No USDC moves.{" "}
                  <b>The proof gates the money; tampering changes nothing.</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
