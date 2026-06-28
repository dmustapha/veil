"use client";

/**
 * Client for the off-chain proving backend. These endpoints (/api/prove and
 * /api/prove/status) are added in the next build: this proves a lock holds
 * collateral >= T in zero knowledge, which takes a few minutes. We call them
 * honestly here. If they are not deployed yet, we surface a clear message and
 * NEVER fabricate a seal: without a real proof, no borrow can run.
 */

export type ProveStatus =
  | { state: "pending"; message?: string }
  | { state: "ready"; seal: string; journal: string }
  | { state: "error"; message: string };

const NOT_READY =
  "The proving backend is not available yet. Proving runs off-chain and is wired in the next build; without a real proof, no borrow can run.";

/** Kick off a proof for a lock. Returns a job id to poll. */
export async function startProve(
  h: string,
  escrow: string
): Promise<{ id: string }> {
  let res: Response;
  try {
    res = await fetch("/api/prove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ h, escrow }),
    });
  } catch {
    throw new Error(NOT_READY);
  }
  if (res.status === 404) throw new Error(NOT_READY);
  if (!res.ok) {
    // Surface the server's honest reason (unavailable host, no lock, etc.) when present.
    const reason = await res
      .json()
      .then((d: { reason?: string }) => d?.reason)
      .catch(() => undefined);
    throw new Error(reason || "The proving backend returned an error.");
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("The proving backend returned no job id.");
  return { id: data.id };
}

/** Poll a proof job once. */
export async function checkProve(id: string): Promise<ProveStatus> {
  let res: Response;
  try {
    res = await fetch(`/api/prove/status?id=${encodeURIComponent(id)}`);
  } catch {
    return { state: "error", message: NOT_READY };
  }
  if (res.status === 404) return { state: "error", message: NOT_READY };
  if (!res.ok) {
    return { state: "error", message: "The proving backend returned an error." };
  }
  return (await res.json()) as ProveStatus;
}
