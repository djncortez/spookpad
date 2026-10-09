// Formatting for the home page's counters and the newest-coin ticker.
import type { GraveCoin } from "./graveyard";

export interface Compact { to: number; suffix: "" | "K" | "M" }

// What a counter counts up to: whole numbers below 10,000, then one decimal of K or M.
export function compactCount(n: number): Compact {
  const v = Math.max(0, Math.floor(n));
  if (v < 10_000) return { to: v, suffix: "" };
  const k = Number((v / 1_000).toFixed(1));
  if (k < 1_000) return { to: k, suffix: "K" };
  return { to: Number((v / 1_000_000).toFixed(1)), suffix: "M" };
}

// A counter's final text (also what reduced motion and screen readers get).
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const { to, suffix } = compactCount(n);
  return `${to.toLocaleString("en-US")}${suffix}`;
}

// One ticker line of the newest coins, newest first; null when there are none (the ticker is hidden).
export function tickerLine(coins: Pick<GraveCoin, "name" | "ticker" | "launched_at">[], max = 12): string | null {
  if (!coins.length) return null;
  const newest = [...coins].sort((a, b) => Date.parse(b.launched_at) - Date.parse(a.launched_at)).slice(0, max);
  return `${newest.map((c) => `${c.name} $${c.ticker}`).join(" ✦ ")} ✦`;
}
