"use client";

/**
 * Cross-chain wait for the Axelar GMP message a `VeilEthLock.lock` emits. Axelar's decentralized
 * validator set confirms the Sepolia lock and delivers an approved `(C, amount)` message to the Soroban
 * gateway; only then can `veil-pool.execute` authenticate it. This polls the Axelarscan GMP API until
 * the message is approved (or errors), and surfaces the `messageId` + `sourceAddress` the pool needs.
 *
 * The message id is Axelar's `${sourceTx}-${logIndex}` form from `approved.returnValues.messageId` —
 * NOT Axelarscan's underscore `call.id` (using the latter makes `execute`'s `validate_message` fail).
 */
const GMP_API = "https://testnet.api.axelarscan.io/gmp/searchGMP";

/** Axelar delivery states we act on. `approved` (and `executed`) mean the pool can execute. */
export type AxelarStatus =
  | "called" | "confirming" | "confirmed" | "approving" | "approved" | "executing" | "executed" | "error" | "unknown";

export interface AxelarMessage {
  status: AxelarStatus;
  /** `${sourceTx}-${logIndex}` — the id `veil-pool.execute` must be given (present once approved). */
  messageId: string | null;
  /** The Sepolia VeilEthLock address, exactly as Axelar approved it (checksummed) — the pool pins this. */
  sourceAddress: string | null;
  sourceChain: string | null;
  approveTxHash: string | null;
  /** RECOVERABLE gas underfunding (is_insufficient_fee / is_not_enough_gas). NOT fatal — Axelar can
   *  still deliver once the fee is topped up or re-estimated, which is common on testnet. */
  gasShort: boolean;
  /** Axelarscan page for this message, so the UI can link the user to inspect / top up the gas. */
  messageUrl: string | null;
  /** A human-facing reason when `status === "error"` (a FATAL, non-deliverable condition). */
  error: string | null;
}

/** Whether the pool can now execute: the destination gateway has an approved message (robust signal —
 *  the presence of the approve tx, not the status vocabulary). */
export function isExecutable(m: AxelarMessage): boolean {
  return m.messageId != null && (m.approveTxHash != null || m.status === "approved" || m.status === "executed");
}

/**
 * Parse the Axelarscan `searchGMP` response into an {@link AxelarMessage}. Pure and defensive — the
 * payload is large and optional-heavy; we read only the fields we act on. Validated against the live
 * response shape in scripts/check-axelar.ts.
 */
export function parseGmpResponse(json: unknown): AxelarMessage {
  const root = json as { data?: unknown[] } | unknown[];
  const list = Array.isArray(root) ? root : (root?.data ?? []);
  const e = (Array.isArray(list) ? list[0] : undefined) as Record<string, any> | undefined;
  if (!e) return { status: "unknown", messageId: null, sourceAddress: null, sourceChain: null, approveTxHash: null, gasShort: false, messageUrl: null, error: null };

  // FATAL: the message can never be delivered as-is → abort. RECOVERABLE (gas): underfunded, but Axelar
  // can still deliver once the fee is topped up / re-estimated (common on testnet), so we keep waiting
  // instead of hard-killing the repay/lock on a transient gas flag.
  const fatalFlags = [
    e.is_invalid_source_address && "invalid source address",
    e.is_invalid_destination_chain && "invalid destination chain",
    e.error && "Axelar reported an execution error",
  ].filter(Boolean) as string[];
  const gasShort = !!(e.is_insufficient_fee || e.is_not_enough_gas);

  const rawStatus = String(e.status ?? e.simplified_status ?? "unknown").toLowerCase();
  const status: AxelarStatus = fatalFlags.length
    ? "error"
    : (["called", "confirming", "confirmed", "approving", "approved", "executing", "executed"].includes(rawStatus)
        ? (rawStatus as AxelarStatus)
        : "unknown");

  return {
    status,
    messageId: e.approved?.returnValues?.messageId ?? e.message_id ?? null,
    sourceAddress: e.call?.returnValues?.sender ?? null,
    sourceChain: e.call?.chain ?? null,
    approveTxHash: e.approved?.transactionHash ?? null,
    gasShort,
    messageUrl: null,
    error: fatalFlags[0] ?? null,
  };
}

/** One live query of the GMP API for a source (Sepolia) tx hash. */
export async function fetchAxelarStatus(sourceTxHash: string): Promise<AxelarMessage> {
  const res = await fetch(GMP_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txHash: sourceTxHash }),
  });
  if (!res.ok) throw new Error(`Axelar GMP API ${res.status}`);
  const m = parseGmpResponse(await res.json());
  return { ...m, messageUrl: `https://testnet.axelarscan.io/gmp/${sourceTxHash}` };
}

export interface WaitOptions {
  timeoutMs?: number; // default 20 min (Axelar testnet confirm can be slow)
  intervalMs?: number; // default 15 s
  onUpdate?: (m: AxelarMessage) => void;
}

/**
 * Poll until the Axelar message is approved (executable) or errors. Throws on error/timeout so the UI
 * can react; resolves with the approved {@link AxelarMessage} carrying the `messageId` + `sourceAddress`.
 */
export async function waitForAxelarApproval(
  sourceTxHash: string,
  opts: WaitOptions = {},
): Promise<AxelarMessage> {
  const timeoutMs = opts.timeoutMs ?? 20 * 60_000;
  const intervalMs = opts.intervalMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = await fetchAxelarStatus(sourceTxHash).catch(
      () => ({ status: "unknown" as const, messageId: null, sourceAddress: null, sourceChain: null, approveTxHash: null, gasShort: false, messageUrl: `https://testnet.axelarscan.io/gmp/${sourceTxHash}`, error: null }),
    );
    opts.onUpdate?.(m);
    // Executability wins over a stale/transient error flag: once the message is approved on the
    // destination gateway, an early is_not_enough_gas that later cleared must not abort the wait.
    if (isExecutable(m)) return m;
    if (m.status === "error") throw new Error(m.error ?? "Axelar delivery failed");
    if (Date.now() > deadline) throw new Error("timed out waiting for Axelar approval");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
