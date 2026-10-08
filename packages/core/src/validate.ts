// The coin fields a trader types on the Launch page (spec §2 step 2). Shared by the browser form and the functions.
import { lamportsToSol } from "./sol";

export interface CoinFields {
  name: string;
  ticker: string;
  description: string;
  twitter: string | null;
  telegram: string | null;
}

const TICKER = /^[A-Z0-9]{2,10}$/;
const MAX_LINK = 200;

function link(value: unknown, hosts: string[], label: string, errors: string[]): string | null {
  if (value === undefined || value === null || value === "") return null;
  const bad = () => { errors.push(`${label} link must start with https://${hosts[0]}/`); return null; };
  if (typeof value !== "string" || value.length > MAX_LINK) return bad();
  let url: URL;
  try { url = new URL(value.trim()); } catch { return bad(); }
  if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase())) return bad();
  return url.toString();
}

export function validateCoinFields(input: unknown): { ok: true; fields: CoinFields } | { ok: false; errors: string[] } {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (name.length < 1 || name.length > 32) errors.push("Name must be 1 to 32 characters.");
  const ticker = typeof o.ticker === "string" ? o.ticker.trim().replace(/^\$/, "").toUpperCase() : "";
  if (!TICKER.test(ticker)) errors.push("Ticker must be 2 to 10 letters or digits.");
  const description = typeof o.description === "string" ? o.description.trim() : "";
  if (description.length > 200) errors.push("Description must be 200 characters or fewer.");
  const twitter = link(o.twitter, ["x.com", "twitter.com", "www.x.com", "www.twitter.com"], "X", errors);
  const telegram = link(o.telegram, ["t.me", "telegram.me"], "Telegram", errors);
  return errors.length ? { ok: false, errors } : { ok: true, fields: { name, ticker, description, twitter, telegram } };
}

// The dev buy in lamports: a whole number from 0 to the admin's maximum. null when fine.
export function checkDevBuy(value: unknown, maxLamports: number): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return "The dev buy must be a SOL amount.";
  if (value > maxLamports) return `The dev buy can be at most ${lamportsToSol(maxLamports)} SOL.`;
  return null;
}
