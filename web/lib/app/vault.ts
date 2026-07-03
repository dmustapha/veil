"use client";

/**
 * Device-local encryption for the shielded-note store (closes audit M-01: plaintext note secrets in
 * localStorage meant any XSS = total note compromise, since the opening fields ARE the spend witness).
 * A passphrase is stretched with PBKDF2-SHA256 into an AES-GCM key held only in memory for the session;
 * notes are encrypted at rest, so a DOM read alone yields ciphertext. Uses Web Crypto (browser + Node ≥20).
 */
const PBKDF2_ITERS = 210_000; // OWASP 2023 floor for PBKDF2-SHA256
const IV_LEN = 12;
const SALT_LEN = 16;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Coerce a Uint8Array to BufferSource (TS 5.7 lib.dom narrows away SharedArrayBuffer-backed views). */
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

/** Bytes → base64 (store-safe). The note store is small, so the spread is fine. */
export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** base64 → bytes. */
export function b64ToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** A fresh random salt for a new vault. */
export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LEN));
}

/** Stretch a passphrase + salt into a non-extractable AES-GCM-256 key. */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", bs(enc.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bs(salt), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** AES-GCM encrypt `plaintext` → base64(iv ‖ ciphertext+tag). */
export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(enc.encode(plaintext))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

/** Decrypt a base64(iv ‖ ciphertext) envelope. Throws on a wrong key or any tamper (GCM auth tag). */
export async function decryptWithKey(key: CryptoKey, envelope: string): Promise<string> {
  const raw = b64ToBytes(envelope);
  const iv = raw.slice(0, IV_LEN);
  const ct = raw.slice(IV_LEN);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(ct));
  return dec.decode(pt);
}
