import { NextResponse } from "next/server";
import type { CheatResponse } from "@/lib/api-types";
import { CHEAT } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The tamper defense, stated from the live-proven on-chain result. In the Phase-7 cross-chain e2e a
 * borrow proof with a tampered public `threshold` was rejected by the Soroban borrow verifier with
 * `Error(Contract, #0)` (InvalidProof) and zero USDC moved (DEPLOYMENTS.md "LIVE e2e COMPLETE"); the
 * interactive live tamper runs through the app's Try-to-cheat flow against the deployed vault.
 */
export async function GET() {
  const body: CheatResponse = {
    source: "cached",
    rejected: true,
    code: CHEAT.forged.code,
    reason: CHEAT.forged.reason,
    detail: "the on-chain trap proven in the Phase-7 cross-chain e2e (tampered threshold → InvalidProof, 0 USDC)",
    replayCode: CHEAT.replay.code,
  };
  return NextResponse.json(body);
}
