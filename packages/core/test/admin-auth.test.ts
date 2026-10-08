import { expect, test } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { login, makeChallenge, sessionWallet } from "@spookpad/core/admin-auth";
import { toBase64, toBase64Url, utf8 } from "@spookpad/core/encoding";

// throwaway wallets (Phantom signs the message bytes with the wallet's ed25519 key)
const seed = ed25519.utils.randomSecretKey();
const WALLET = bs58.encode(ed25519.getPublicKey(seed));
const other = ed25519.utils.randomSecretKey();
const OTHER = bs58.encode(ed25519.getPublicKey(other));
const env = { ADMIN_WALLET: WALLET, ADMIN_SESSION_SECRET: "s".repeat(40) };
const HOST = "spookpad.example";
const sign = (message: string, key = seed) => toBase64(ed25519.sign(utf8(message), key));

async function signIn({ now = Date.now() } = {}) {
  const c = await makeChallenge({ wallet: WALLET, host: HOST, env, now });
  return login({ ...c, signature: sign(c.message), host: HOST, env, now });
}

test("the admin wallet signs in and its session maps back to the wallet", async () => {
  const { session, wallet } = await signIn();
  expect(wallet).toBe(WALLET);
  expect(await sessionWallet(`Bearer ${session}`, env)).toBe(WALLET);
});

test("the challenge is a plain message naming SpookPad, the site and the wallet", async () => {
  const { message } = await makeChallenge({ wallet: WALLET, host: HOST, env });
  expect(message).toMatch(/^Sign in to the SpookPad admin page\./);
  expect(message).toContain(`Site: ${HOST}`);
  expect(message).toContain(`Wallet: ${WALLET}`);
  expect(message).toMatch(/not a transaction/);
});

test("any other wallet is refused before it is asked to sign", async () => {
  await expect(makeChallenge({ wallet: OTHER, host: HOST, env })).rejects.toThrow(/not the admin wallet/);
});

test("a signature from another key is refused", async () => {
  const c = await makeChallenge({ wallet: WALLET, host: HOST, env });
  await expect(login({ ...c, signature: sign(c.message, other), host: HOST, env })).rejects.toThrow(/signature/);
});

test("garbage signatures are refused, not crashed on", async () => {
  const c = await makeChallenge({ wallet: WALLET, host: HOST, env });
  for (const signature of ["", "!!!", undefined, 42]) {
    await expect(login({ ...c, signature, host: HOST, env })).rejects.toThrow(/signature/);
  }
});

test("an edited challenge is refused", async () => {
  const c = await makeChallenge({ wallet: WALLET, host: HOST, env });
  const message = c.message.replace(/Expires: .*/, `Expires: ${new Date(Date.now() + 864e5).toISOString()}`);
  await expect(login({ ...c, message, signature: sign(message), host: HOST, env })).rejects.toThrow(/challenge/);
});

test("an expired challenge is refused", async () => {
  const now = Date.now();
  const c = await makeChallenge({ wallet: WALLET, host: HOST, env, now });
  await expect(login({ ...c, signature: sign(c.message), host: HOST, env, now: now + 6 * 60_000 })).rejects.toThrow(/expired/);
});

test("a challenge made for another site is refused", async () => {
  const c = await makeChallenge({ wallet: WALLET, host: "evil.example", env });
  await expect(login({ ...c, signature: sign(c.message), host: HOST, env })).rejects.toThrow(/another site/);
});

test("sessions expire after 12 hours, can't be forged, and end when the wallet or secret changes", async () => {
  const now = Date.now();
  const old = await signIn({ now: now - 13 * 3600_000 });
  expect(await sessionWallet(`Bearer ${old.session}`, env, now)).toBeNull();

  const { session } = await signIn({ now });
  const [body, mac] = session.split(".");
  const forged = `${toBase64Url(utf8(JSON.stringify({ w: WALLET, exp: now + 864e7 })))}.${mac}`;
  expect(await sessionWallet(`Bearer ${forged}`, env, now)).toBeNull();
  expect(await sessionWallet(`Bearer ${body}.x`, env, now)).toBeNull();
  expect(await sessionWallet("", env, now)).toBeNull();
  expect(await sessionWallet(null, env, now)).toBeNull();
  expect(await sessionWallet(`Bearer ${session}`, { ...env, ADMIN_WALLET: OTHER }, now)).toBeNull();
  expect(await sessionWallet(`Bearer ${session}`, { ...env, ADMIN_SESSION_SECRET: "t".repeat(40) }, now)).toBeNull();
});

test("a challenge MAC can't be used as a session", async () => {
  const c = await makeChallenge({ wallet: WALLET, host: HOST, env });
  expect(await sessionWallet(`Bearer ${toBase64Url(utf8(c.message))}.${c.mac}`, env)).toBeNull();
});

test("a missing admin wallet or a weak secret refuses everything", async () => {
  await expect(makeChallenge({ wallet: WALLET, host: HOST, env: { ...env, ADMIN_WALLET: "" } })).rejects.toThrow(/ADMIN_WALLET/);
  await expect(makeChallenge({ wallet: WALLET, host: HOST, env: { ...env, ADMIN_SESSION_SECRET: "short" } })).rejects.toThrow(/ADMIN_SESSION_SECRET/);
  const { session } = await signIn();
  expect(await sessionWallet(`Bearer ${session}`, { ...env, ADMIN_SESSION_SECRET: "short" })).toBeNull();
});
