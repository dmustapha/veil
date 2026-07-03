/** Small presentation helpers for the workspace. No secrets, no amounts. */

export const truncate = (a: string, head = 6, tail = 4) =>
  a.length > head + tail ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;

export const ethTxUrl = (hash: string) =>
  `https://sepolia.etherscan.io/tx/${hash}`;

export const stellarTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
