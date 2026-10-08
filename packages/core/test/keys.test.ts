import { describe, expect, test } from "vitest";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";
import { toBase64 } from "../src/encoding";
import { decryptSecret, encryptSecret, keypairFromSecret, newKeypair, signBytes } from "../src/keys";

const MASTER = toBase64(new Uint8Array(32).fill(7));

describe("keypairs", () => {
  test("a new keypair is a 64-byte Solana secret whose signatures verify", () => {
    const kp = newKeypair();
    expect(kp.secretKey).toHaveLength(64);
    expect(bs58.decode(kp.publicKey)).toEqual(kp.secretKey.slice(32));
    const msg = new Uint8Array([1, 2, 3]);
    expect(ed25519.verify(signBytes(kp, msg), msg, bs58.decode(kp.publicKey))).toBe(true);
  });

  test("reads a Phantom-style base58 secret and refuses a mismatched one", () => {
    const kp = newKeypair();
    expect(keypairFromSecret(bs58.encode(kp.secretKey)).publicKey).toBe(kp.publicKey);
    const bad = new Uint8Array(kp.secretKey);
    bad[40] ^= 1;
    expect(() => keypairFromSecret(bad)).toThrow(/doesn't match/);
    expect(() => keypairFromSecret(new Uint8Array(32))).toThrow(/64 bytes/);
  });
});

describe("encrypted secrets", () => {
  test("round-trips under the same key and label", async () => {
    const kp = newKeypair();
    const enc = await encryptSecret(MASTER, kp.secretKey, "coin:1:creator");
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(bs58.encode(kp.secretKey));
    expect(await decryptSecret(MASTER, enc, "coin:1:creator")).toEqual(kp.secretKey);
  });

  test("a wrong key, a wrong label or a changed byte fails", async () => {
    const enc = await encryptSecret(MASTER, newKeypair().secretKey, "coin:1:mint");
    await expect(decryptSecret(toBase64(new Uint8Array(32).fill(8)), enc, "coin:1:mint")).rejects.toThrow();
    await expect(decryptSecret(MASTER, enc, "coin:2:mint")).rejects.toThrow();
    const raw = enc.slice(3);
    const flipped = `v1:${raw.slice(0, 20)}${raw[20] === "A" ? "B" : "A"}${raw.slice(21)}`;
    await expect(decryptSecret(MASTER, flipped, "coin:1:mint")).rejects.toThrow();
  });

  test("the master key must be 32 bytes", async () => {
    await expect(encryptSecret(toBase64(new Uint8Array(16)), new Uint8Array(64), "x")).rejects.toThrow(/32 bytes/);
  });
});
