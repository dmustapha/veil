// The WebCrypto vault behind the encrypted note store (audit M-01): round-trip, ciphertext really
// hides the plaintext, GCM auth rejects a wrong key / tampered envelope, and base64 is lossless.
import { describe, expect, it } from "vitest";
import {
  b64ToBytes, bytesToB64, decryptWithKey, deriveKey, encryptWithKey, randomSalt,
} from "./vault";

const salt = randomSalt();
const key = async (pass = "correct horse battery staple") => deriveKey(pass, salt);

describe("vault encryption", () => {
  it("round-trips a payload", async () => {
    const k = await key();
    const secret = JSON.stringify({ nk: "12345678901234567890", blinding: "9999" });
    expect(await decryptWithKey(k, await encryptWithKey(k, secret))).toBe(secret);
  });

  it("ciphertext does not contain the plaintext secret", async () => {
    const k = await key();
    const nk = "31415926535897932384626433832795028841971";
    const envelope = await encryptWithKey(k, `{"nk":"${nk}"}`);
    expect(envelope).not.toContain(nk);
  });

  it("a wrong passphrase cannot decrypt (GCM auth)", async () => {
    const envelope = await encryptWithKey(await key("right"), "top secret");
    await expect(decryptWithKey(await key("wrong"), envelope)).rejects.toThrow();
  });

  it("a tampered envelope is rejected", async () => {
    const k = await key();
    const envelope = await encryptWithKey(k, "top secret");
    const bytes = b64ToBytes(envelope);
    bytes[bytes.length - 1] ^= 0xff; // flip a ciphertext byte
    await expect(decryptWithKey(k, bytesToB64(bytes))).rejects.toThrow();
  });

  it("base64 helpers are lossless over random bytes", () => {
    const b = crypto.getRandomValues(new Uint8Array(40));
    expect(Array.from(b64ToBytes(bytesToB64(b)))).toEqual(Array.from(b));
  });
});
