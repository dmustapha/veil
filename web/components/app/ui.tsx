"use client";

import { Check, ExternalLink } from "lucide-react";

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

/** A live progress checklist for a multi-step flow: done steps get a check, the active step spins. */
export function StepList({
  steps,
  current,
  done,
  detail,
}: {
  steps: readonly { key: string; label: string }[];
  current: string | null;
  done: ReadonlySet<string>;
  detail?: string;
}) {
  return (
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
              {s.label}
              {state === "active" && detail ? <span className="help"> — {detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
