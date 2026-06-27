import { NextResponse } from "next/server";
import type { CheatResponse } from "@/lib/api-types";
import { CHEAT } from "@/lib/constants";
import { JOURNAL_HEX, SEAL_HEX } from "@/lib/onchain";
import { simulateCheat, withRetry } from "@/lib/server/soroban";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull the Soroban error code, e.g. "Error(Crypto, InvalidInput)". */
function extractCode(detail: string): string {
  const m = detail.match(/Error\([^)]*\)/);
  return m ? m[0] : CHEAT.forged.code;
}

export async function GET() {
  try {
    const sim = await withRetry(() => simulateCheat(SEAL_HEX, JOURNAL_HEX));
    if (sim.ok) {
      // The vault accepted a tampered proof: the defense is broken. Surface honestly.
      const body: CheatResponse = {
        source: "live",
        rejected: false,
        code: "UNEXPECTED_ACCEPT",
        reason: "tampered proof was not rejected",
        detail: "",
        replayCode: CHEAT.replay.code,
      };
      return NextResponse.json(body, { status: 500 });
    }
    const detail = sim.error || "";
    const body: CheatResponse = {
      source: "live",
      rejected: true,
      code: extractCode(detail),
      reason: CHEAT.forged.reason,
      detail: detail.slice(0, 600),
      replayCode: CHEAT.replay.code,
    };
    return NextResponse.json(body);
  } catch {
    // RPC unreachable: fall back to the known-real trap (re-verified live in WIRE-REPORT).
    const body: CheatResponse = {
      source: "cached",
      rejected: true,
      code: CHEAT.forged.code,
      reason: CHEAT.forged.reason,
      detail: "live RPC unavailable; showing the verified on-chain trap",
      replayCode: CHEAT.replay.code,
    };
    return NextResponse.json(body);
  }
}
