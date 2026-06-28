import { NextResponse } from "next/server";
import { ESCROW } from "@/lib/onchain";
import {
  buildFixture,
  ensureCheckpoint,
  dispatchProof,
  Unavailable,
} from "@/lib/server/prover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/prove  { h, escrow?, block? }  ->  { id }
 *
 * Starts a REAL proof for a lock:
 *   1. live eth_getProof(escrow, [slot(H)], block) on Sepolia -> host fixture + meta,
 *   2. ensure the vault has a checkpoint for that block (admin posts it; DISCLOSED trust),
 *   3. dispatch the prove.yml workflow with the fixture; return its run id to poll.
 *
 * Honest failure: if the proving host (gh + admin key) is absent, returns 503 with a clear
 * reason and NO id. The client surfaces the reason and never runs a borrow without a real proof.
 */
export async function POST(req: Request) {
  let body: { h?: string; escrow?: string; block?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request", reason: "invalid JSON body" }, { status: 400 });
  }
  const h = body.h?.trim();
  if (!h) {
    return NextResponse.json(
      { error: "bad-request", reason: "missing hashlock `h`" },
      { status: 400 }
    );
  }
  const escrow = body.escrow?.trim() || ESCROW;

  try {
    const fx = await buildFixture(h, escrow, body.block);
    await ensureCheckpoint(fx.block, fx.stateRoot);
    const id = await dispatchProof(fx);
    return NextResponse.json({ id, block: fx.block });
  } catch (e) {
    if (e instanceof Unavailable) {
      return NextResponse.json(
        {
          error: "unavailable",
          reason: `${e.message}. The proving backend runs where gh + the Stellar admin key live (see web/PROVING.md).`,
        },
        { status: 503 }
      );
    }
    const raw = e instanceof Error ? e.message : "could not start proving";
    // PRIVACY backstop: a prove-failed reason must never carry the private
    // collateral amount (slot value / fixture / meta). If anything amount-shaped
    // or base64-bulky slips through, return a safe generic reason instead.
    const looksLeaky =
      /0x2386f26fc10000|10000000000000000|fixture_b64|meta_b64|[A-Za-z0-9+/]{120,}/.test(
        raw
      );
    const reason = looksLeaky ? "could not start proving" : raw;
    return NextResponse.json({ error: "prove-failed", reason }, { status: 502 });
  }
}
