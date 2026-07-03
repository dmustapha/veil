// The pure Axelar-log locator behind the cross-chain wait: it must pick the gateway's ContractCall
// event (by address AND selector) out of a lock receipt's mixed logs, and derive the message-id half.
import { describe, expect, it } from "vitest";
import type { Log } from "viem";
import { CONTRACT_CALL_TOPIC, findContractCallLog } from "./eth";
import { AXELAR_GATEWAY_SEPOLIA } from "@/lib/onchain";

const GATEWAY = AXELAR_GATEWAY_SEPOLIA;
const log = (address: string, topic0: string, logIndex: number) =>
  ({ address, topics: [topic0], logIndex } as unknown as Log);

describe("CONTRACT_CALL_TOPIC", () => {
  it("is the canonical Axelar ContractCall event selector", () => {
    expect(CONTRACT_CALL_TOPIC).toBe(
      "0x30ae6cc78c27e651745bf2ad08a11de83910ac1e347a52f7ac898c0fbef94dae",
    );
  });
});

describe("findContractCallLog", () => {
  it("locates the gateway ContractCall among mixed logs", () => {
    const logs = [
      log("0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", "0xddf252ad", 5), // WETH Transfer
      log("0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6", "0x99534137", 6), // gasService NativeGasPaid
      log(GATEWAY, CONTRACT_CALL_TOPIC, 7), // gateway ContractCall
    ];
    expect(findContractCallLog(logs, GATEWAY)).toEqual({ logIndex: 7, position: 2 });
  });

  it("ignores a gateway log with a different selector", () => {
    expect(findContractCallLog([log(GATEWAY, "0xdeadbeef", 3)], GATEWAY)).toBeNull();
  });

  it("ignores a ContractCall selector from a non-gateway address", () => {
    expect(findContractCallLog([log("0x0000000000000000000000000000000000000001", CONTRACT_CALL_TOPIC, 3)], GATEWAY)).toBeNull();
  });

  it("returns null when there is no ContractCall", () => {
    expect(findContractCallLog([], GATEWAY)).toBeNull();
  });
});
