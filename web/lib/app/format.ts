/** Small presentation helpers for the workspace. No secrets, no amounts. */

export const truncate = (a: string, head = 6, tail = 4) =>
  a.length > head + tail ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;

export const ethTxUrl = (hash: string) =>
  `https://sepolia.etherscan.io/tx/${hash}`;

export const stellarTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

/**
 * Maximum loan-to-value, computed against the PROVEN MINIMUM collateral (the
 * public threshold), not the real amount. Because real collateral >= threshold,
 * the true LTV is at most this. Honest and privacy-preserving.
 */
export function maxLtv(
  principalUsdc: string,
  thresholdWei: string,
  priceUsd: string
): number | null {
  const px = parseFloat(priceUsd.replace(/,/g, ""));
  const thrEth = Number(BigInt(thresholdWei)) / 1e18;
  const principal = parseFloat(principalUsdc);
  const collateralFloor = thrEth * px;
  if (!collateralFloor || !isFinite(collateralFloor)) return null;
  return (principal / collateralFloor) * 100;
}

export const dueDate = (deadline: number) =>
  new Date(deadline * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
