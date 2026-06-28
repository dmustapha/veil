import { NextResponse } from "next/server";
import type { PositionResponse, StatePrice } from "@/lib/api-types";
import { POSITION } from "@/lib/constants";
import { ESCROW, USDC_DECIMALS } from "@/lib/onchain";
import {
  readConfig,
  readLoan,
  readLock,
  readPrice,
  readPriceDecimals,
  withRetry,
} from "@/lib/server/soroban";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H_RE = /^0x[0-9a-fA-F]{64}$/;

const fmtUsd = (raw: bigint, decimals: number) =>
  (Number(raw) / 10 ** decimals).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtUsdc = (raw: bigint) => (Number(raw) / 10 ** USDC_DECIMALS).toFixed(2);

const CACHED_PRICE: StatePrice = {
  usd: POSITION.reflectorPrice.replace("$", ""),
  raw: "157561286034249435",
  decimals: 14,
};

async function loadPrice(): Promise<{ price: StatePrice; live: boolean }> {
  try {
    const [p, decimals] = await Promise.all([
      withRetry(readPrice),
      withRetry(readPriceDecimals),
    ]);
    const raw = BigInt(p.price);
    return {
      price: { usd: fmtUsd(raw, decimals), raw: raw.toString(), decimals },
      live: true,
    };
  } catch {
    return { price: CACHED_PRICE, live: false };
  }
}

async function loadLoan(h: string) {
  const loan = await withRetry(() => readLoan(h));
  if (!loan) return null;
  // res holds the real principal/threshold; amount of collateral is NOT here.
  return {
    principalUsdc: fmtUsdc(BigInt(loan.principal as bigint)),
    thresholdWei: String(loan.threshold_wei),
    repaid: Boolean(loan.repaid),
    defaulted: Boolean(loan.defaulted),
    dueLedger: Number(loan.due_ledger ?? 0),
  };
}

export async function GET(req: Request) {
  const h = new URL(req.url).searchParams.get("h") ?? "";
  if (!H_RE.test(h)) {
    return NextResponse.json({ error: "bad hashlock" }, { status: 400 });
  }

  const [{ price, live }, lock, loan, ltv] = await Promise.all([
    loadPrice(),
    withRetry(() => readLock(ESCROW, h)).catch(() => null),
    loadLoan(h).catch(() => null),
    withRetry(readConfig)
      .then((c) => (Number(c.ltv_bps) / 100).toString())
      .catch(() => POSITION.ltv.replace("%", "")),
  ]);

  const body: PositionResponse = {
    source: live && lock ? "live" : "cached",
    h,
    lock,
    loan,
    price,
    ltv,
  };
  return NextResponse.json(body);
}
