"use client";

import { Check, Clock, ExternalLink } from "lucide-react";

/** A monospace transaction link to a block explorer. */
export function TxLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="tx-inline mono" href={href} target="_blank" rel="noopener noreferrer">
      {label} <ExternalLink aria-hidden="true" />
    </a>
  );
}

/** A small inline notice: info, error, or success. */
export function Notice({
  tone,
  children,
}: {
  tone: "info" | "error" | "ok";
  children: React.ReactNode;
}) {
  return (
    <p className={`app-notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

/**
 * A live progress checklist for a multi-step flow: done steps get a check, the active step spins and
 * is emphasized, and an optional live `detail` sub-status streams under it. When the active step is a
 * known long wait (`waitKeys`), a reassurance banner explains the delay so it never looks frozen.
 */
export function StepList({
  steps,
  current,
  done,
  detail,
  waitKeys,
  waitText,
}: {
  steps: readonly { key: string; label: string }[];
  current: string | null;
  done: ReadonlySet<string>;
  detail?: string;
  waitKeys?: readonly string[];
  waitText?: React.ReactNode;
}) {
  const waiting = !!current && !!waitKeys?.includes(current);
  return (
    <div className="step-panel">
      <ol className="step-list" aria-live="polite">
        {steps.map((s) => {
          const state = done.has(s.key) ? "done" : s.key === current ? "active" : "pending";
          return (
            <li key={s.key} className={`step ${state}`}>
              <span className="step-mark" aria-hidden="true">
                {state === "done" ? (
                  <Check />
                ) : state === "active" ? (
                  <span className="spin-lime" />
                ) : (
                  <span className="step-dot" />
                )}
              </span>
              <span className="step-label">
                <span className="step-text">{s.label}</span>
                {state === "active" && detail ? (
                  <span className="step-detail">{detail}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {waiting && waitText ? (
        <p className="step-wait" role="status">
          <Clock aria-hidden="true" />
          <span>{waitText}</span>
        </p>
      ) : null}
    </div>
  );
}
