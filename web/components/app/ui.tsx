"use client";

import { ExternalLink } from "lucide-react";

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
