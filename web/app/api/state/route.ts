import { NextResponse } from "next/server";
import type {
  StateConfig,
  StateLoan,
  StateLock,
  StatePrice,
  StateResponse,
  Source,
} from "@/lib/api-types";
import { POSITION, PROOF } from "@/lib/constants";
import { ESCROW, HASHLOCK, USDC_DECIMALS, VERIFIER } from "@/lib/onchain";
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

const fmtUsd = (raw: bigint, decimals: number) => {
  const denom = 10 ** decimals;
  const n = Number(raw) / denom;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtUsdc = (raw: bigint) =>
  (Number(raw) / 10 ** USDC_DECIMALS).toFixed(2);

const CACHED_PRICE: StatePrice = {
  usd: POSITION.reflectorPrice.replace("$", ""),
  raw: "157561286034249435",
  decimals: 14,
};
const CACHED_LOAN: StateLoan = {
  principalUsdc: POSITION.loanUsdc.toFixed(2),
  thresholdWei: "5000000000000000",
  repaid: false,
};
const CACHED_CONFIG: StateConfig = {
  ltv: POSITION.ltv.replace("%", ""),
  imageId: PROOF.imageId,
  verifier: VERIFIER,
};
const CACHED_LOCK: StateLock = { locked: true, closed: true };

async function loadPrice(): Promise<{ price: StatePrice; src: Source }> {
  try {
    const [p, decimals] = await Promise.all([
      withRetry(readPrice),
      withRetry(readPriceDecimals),
    ]);
    const raw = BigInt(p.price);
    return {
      price: { usd: fmtUsd(raw, decimals), raw: raw.toString(), decimals },
      src: "live",
    };
  } catch {
    return { price: CACHED_PRICE, src: "cached" };
  }
}

async function loadSoroban(): Promise<{
  loan: StateLoan;
  config: StateConfig;
  src: Source;
}> {
  try {
    const [cfg, loan] = await Promise.all([
      withRetry(readConfig),
      withRetry(() => readLoan(HASHLOCK)),
    ]);
    const config: StateConfig = {
      ltv: (Number(cfg.ltv_bps) / 100).toString(),
      imageId: "0x" + Buffer.from(cfg.image_id as Buffer).toString("hex"),
      verifier: String(cfg.verifier),
    };
    const stateLoan: StateLoan = loan
      ? {
          principalUsdc: fmtUsdc(BigInt(loan.principal as bigint)),
          thresholdWei: String(loan.threshold_wei),
          repaid: Boolean(loan.repaid),
        }
      : CACHED_LOAN;
    return { loan: stateLoan, config, src: "live" };
  } catch {
    return { loan: CACHED_LOAN, config: CACHED_CONFIG, src: "cached" };
  }
}

async function loadLock(): Promise<{ lock: StateLock; src: Source }> {
  try {
    const lock = await withRetry(() => readLock(ESCROW, HASHLOCK));
    return { lock, src: "live" };
  } catch {
    return { lock: CACHED_LOCK, src: "cached" };
  }
}

export async function GET() {
  const [price, soroban, lock] = await Promise.all([
    loadPrice(),
    loadSoroban(),
    loadLock(),
  ]);

  const legs = {
    soroban: soroban.src,
    reflector: price.src,
    sepolia: lock.src,
  };
  const anyCached = Object.values(legs).some((s) => s === "cached");

  const body: StateResponse = {
    source: anyCached ? "cached" : "live",
    price: price.price,
    loan: soroban.loan,
    config: soroban.config,
    lock: lock.lock,
    legs,
  };
  return NextResponse.json(body);
}
