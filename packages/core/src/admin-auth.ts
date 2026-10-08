// Admin sign-in with Phantom. Only ADMIN_WALLET can sign in:
//   1. makeChallenge -> a plain text message (+ a MAC so the server stores nothing)
//   2. Phantom signMessage() signs it: a message, never a transaction, so it can't move funds
//   3. login -> checks the MAC, site, expiry, wallet and ed25519 signature, returns a 12-hour session
// Sessions are HMAC-signed with ADMIN_SESSION_SECRET; changing it, or ADMIN_WALLET, ends every session.
// Ported from the $NOOB site (netlify/lib/auth.mjs) to Web Crypto so it runs in Deno and Node.
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { fromBase64, fromBase64Url, hex, toBase64Url, utf8 } from "./encoding";

export interface AdminEnv { ADMIN_WALLET?: string; ADMIN_SESSION_SECRET?: string }
export interface AdminSession { session: string; wallet: string; expires: string }

const CHALLENGE_MS = 5 * 60_000;
const SESSION_MS = 12 * 3600_000;
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function config(env: AdminEnv) {
  const wallet = String(env.ADMIN_WALLET ?? "").trim();
  const secret = String(env.ADMIN_SESSION_SECRET ?? "");
  if (!SOLANA_ADDRESS.test(wallet)) throw new Error("ADMIN_WALLET is not set to a Solana address.");
  if (secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must be 32+ random characters.");
  return { wallet, secret };
}

// purpose-tagged MACs, so a challenge MAC can never pass as a session and the other way round
async function mac(secret: string, purpose: "challenge" | "session", data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8(secret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(`${purpose}\n${data}`) as BufferSource)));
}

// constant-time compare
function sameText(given: unknown, expected: string): boolean {
  const x = utf8(String(given ?? "")), y = utf8(expected);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function makeChallenge(o: { wallet: string; host: string; env: AdminEnv; now?: number }): Promise<{ message: string; mac: string }> {
  const s = config(o.env);
  if (o.wallet !== s.wallet) throw new Error("That wallet is not the admin wallet.");
  const now = o.now ?? Date.now();
  const message = [
    "Sign in to the SpookPad admin page.",
    "",
    `Site: ${o.host}`,
    `Wallet: ${o.wallet}`,
    `Nonce: ${hex(crypto.getRandomValues(new Uint8Array(16)))}`,
    `Expires: ${new Date(now + CHALLENGE_MS).toISOString()}`,
    "",
    "This only proves you own the admin wallet. It is not a transaction and cannot move funds.",
  ].join("\n");
  return { message, mac: await mac(s.secret, "challenge", message) };
}

export async function login(o: {
  message: unknown; mac: unknown; signature: unknown; host: string; env: AdminEnv; now?: number;
}): Promise<AdminSession> {
  const s = config(o.env);
  const now = o.now ?? Date.now();
  const text = String(o.message ?? "");
  if (!sameText(o.mac, await mac(s.secret, "challenge", text))) {
    throw new Error("That sign-in challenge wasn't issued by this site. Try again.");
  }
  const field = (name: string) => text.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1];
  if (field("Site") !== o.host) throw new Error("That challenge was made for another site.");
  if (!(Date.parse(field("Expires") ?? "") > now)) throw new Error("The sign-in request expired. Try again.");
  if (field("Wallet") !== s.wallet) throw new Error("That wallet is not the admin wallet.");

  let ok = false;
  try {
    ok = ed25519.verify(fromBase64(String(o.signature ?? "")), utf8(text), bs58.decode(s.wallet));
  } catch {
    ok = false;
  }
  if (!ok) throw new Error("The signature doesn't match the admin wallet.");

  const expires = now + SESSION_MS;
  const body = toBase64Url(utf8(JSON.stringify({ w: s.wallet, exp: expires })));
  return { session: `${body}.${await mac(s.secret, "session", body)}`, wallet: s.wallet, expires: new Date(expires).toISOString() };
}

// The admin wallet behind a valid "Bearer <session>" header, or null.
export async function sessionWallet(authorization: string | null, env: AdminEnv, now = Date.now()): Promise<string | null> {
  let s: { wallet: string; secret: string };
  try { s = config(env); } catch { return null; } // not configured: nobody is admin
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "");
  const [body, given] = token.split(".");
  if (!body || !given || !sameText(given, await mac(s.secret, "session", body))) return null;
  try {
    const { w, exp } = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as { w: string; exp: number };
    return w === s.wallet && exp > now ? w : null;
  } catch {
    return null;
  }
}
