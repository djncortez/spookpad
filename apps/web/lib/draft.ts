// The Launch page's draft (its costumes belong together), a fee payment sent but not yet checked, and a launch sent
// but not yet seen on Solana, kept in this browser so a reload doesn't lose them. The two in-flight records are keyed
// by wallet and only read back for the signed-in wallet. Storage can be unavailable (private windows): everything
// still works without it.
import type { Expiry } from "./pending";

const DRAFT_KEY = "spookpad:draft";
const PAY_KEY = "spookpad:pending-payment:";
const LAUNCH_KEY = "spookpad:sent-launch:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PendingPayment { generationId: string; draftId: string; signature: string; expiry: Expiry }
export interface SentLaunch { generationId: string; mint: string; signature: string; expiry: Expiry }

function get(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable: nothing to keep
  }
}

export function newDraft(): string {
  const id = crypto.randomUUID();
  set(DRAFT_KEY, id);
  return id;
}

export function draftId(): string {
  const saved = get(DRAFT_KEY);
  return saved && UUID.test(saved) ? saved : newDraft();
}

export const setDraft = (id: string): void => set(DRAFT_KEY, id);

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
function expiryOf(v: unknown): Expiry | null {
  const e = v as { blockhash?: unknown } | null;
  return e && str(e.blockhash) ? { blockhash: e.blockhash } : null;
}
function read(key: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(get(key) ?? "null") as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const rememberPayment = (wallet: string, p: PendingPayment): void => set(PAY_KEY + wallet, JSON.stringify(p));
export function pendingPayment(wallet: string): PendingPayment | null {
  const p = read(PAY_KEY + wallet);
  const expiry = expiryOf(p?.expiry);
  return p && expiry && str(p.generationId) && str(p.draftId) && str(p.signature)
    ? { generationId: p.generationId, draftId: p.draftId, signature: p.signature, expiry } : null;
}
export const forgetPayment = (wallet: string): void => set(PAY_KEY + wallet, null);

export const rememberLaunch = (wallet: string, l: SentLaunch): void => set(LAUNCH_KEY + wallet, JSON.stringify(l));
export function sentLaunch(wallet: string): SentLaunch | null {
  const l = read(LAUNCH_KEY + wallet);
  const expiry = expiryOf(l?.expiry);
  return l && expiry && str(l.generationId) && str(l.mint) && str(l.signature)
    ? { generationId: l.generationId, mint: l.mint, signature: l.signature, expiry } : null;
}
export const forgetLaunch = (wallet: string): void => set(LAUNCH_KEY + wallet, null);
