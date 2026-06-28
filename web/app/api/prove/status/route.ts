import { NextResponse } from "next/server";
import { runStatus } from "@/lib/server/prover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/prove/status?id=<runId>  ->  ProveStatus
 *
 * Mirrors lib/app/prove.ts (the client contract):
 *   { state: "pending", message }                         while CI runs (minutes),
 *   { state: "ready", seal, journal }                     when proof.json is downloaded,
 *   { state: "error", message }                           on failure or an unavailable host.
 *
 * Never invents a seal: a ready response always comes from a real, downloaded proof.json.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { state: "error", message: "missing proof job id" },
      { status: 400 }
    );
  }
  const status = await runStatus(id);
  return NextResponse.json(status);
}
