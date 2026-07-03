// Cross-chain encoders/parsers: the Axelar payload must byte-match Solidity abi.encode(C, amount), and
// the GMP response parser must lift the message id + source address the pool's execute needs (shape
// pinned from the live Axelarscan response — see scripts/check-axelar.ts).
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, hexToBytes } from "viem";
import { executePayload, toBaseUnits } from "./stellar";
import { P } from "@/lib/prove/poseidon2";
import { isExecutable, parseGmpResponse } from "./axelar";

describe("executePayload", () => {
  it("byte-matches Solidity abi.encode(uint256 C, uint256 amount)", () => {
    const C = 795149739313561338848873385126253479486454485737362998628268494954929119501n;
    const amount = 2_000_000_000_000_000n;
    const expected = hexToBytes(
      encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [C, amount]),
    );
    expect(executePayload(C, amount)).toEqual(expected);
    expect(executePayload(C, amount)).toHaveLength(64);
  });

  it("rejects a non-canonical commitment or an out-of-range amount", () => {
    expect(() => executePayload(P, 1000n)).toThrow(/canonical/);
    expect(() => executePayload(1n, 0n)).toThrow();
    expect(() => executePayload(1n, 1n << 128n)).toThrow();
  });
});

describe("toBaseUnits", () => {
  it("parses decimal amounts exactly (no float)", () => {
    expect(toBaseUnits("1.234", 7)).toBe(12_340_000n);
    expect(toBaseUnits("10", 7)).toBe(100_000_000n);
    expect(toBaseUnits("0.0000001", 7)).toBe(1n);
  });

  it("rejects malformed, over-precise, or non-positive input", () => {
    expect(() => toBaseUnits("1.23abc", 7)).toThrow();
    expect(() => toBaseUnits("1.12345678", 7)).toThrow(/decimal/);
    expect(() => toBaseUnits("0", 7)).toThrow(/positive/);
  });
});

describe("parseGmpResponse", () => {
  // Minimal fixture in the exact shape the live Axelarscan searchGMP returns.
  const approved = {
    data: [
      {
        status: "executed",
        simplified_status: "executed",
        message_id: "0x6903206311608c7d73396c533bab95da1a35f8692f140db9f1105d562d84d7f9-3",
        call: { chain: "ethereum-sepolia", returnValues: { sender: "0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2" } },
        approved: {
          transactionHash: "e7f363ea02be25a9fa61c2147dd1f5d070979b7d97f9474ff706522304ad9bb6",
          returnValues: { messageId: "0x6903206311608c7d73396c533bab95da1a35f8692f140db9f1105d562d84d7f9-3" },
        },
      },
    ],
  };

  it("lifts the approved message id, source address, and chain", () => {
    const m = parseGmpResponse(approved);
    expect(m.status).toBe("executed");
    expect(m.messageId).toBe("0x6903206311608c7d73396c533bab95da1a35f8692f140db9f1105d562d84d7f9-3");
    expect(m.sourceAddress).toBe("0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2");
    expect(m.sourceChain).toBe("ethereum-sepolia");
    expect(isExecutable(m)).toBe(true);
  });

  it("is not executable while only called", () => {
    const m = parseGmpResponse({ data: [{ status: "called", call: { returnValues: {} } }] });
    expect(m.status).toBe("called");
    expect(isExecutable(m)).toBe(false);
  });

  it("flags insufficient gas as an error", () => {
    const m = parseGmpResponse({ data: [{ status: "called", is_insufficient_fee: true, call: {} }] });
    expect(m.status).toBe("error");
    expect(m.error).toMatch(/gas/i);
  });

  it("returns unknown for an empty result", () => {
    expect(parseGmpResponse({ data: [] }).status).toBe("unknown");
  });

  it("stays executable when approved despite a stale gas-error flag", () => {
    // Axelar's execution-gas flags are irrelevant once approved (we execute the Soroban tx ourselves),
    // so an approved message must remain executable even if is_insufficient_fee is set.
    const m = parseGmpResponse({
      data: [{
        status: "approved", is_insufficient_fee: true,
        call: { chain: "ethereum-sepolia", returnValues: { sender: "0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2" } },
        approved: { transactionHash: "0xabc", returnValues: { messageId: "0xdead-1" } },
      }],
    });
    expect(isExecutable(m)).toBe(true);
  });
});
