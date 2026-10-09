// Kings of the Graveyard (spec 2026-10-09-spookpad-podium-party-design.md): the three coins with the highest known
// market cap, from the coins and caps the Graveyard already loads.
import type { GraveCoin } from "./graveyard";

export interface PodiumSpot { coin: GraveCoin; cap: number; rank: 1 | 2 | 3 }

const known = (cap: number | undefined): cap is number => typeof cap === "number" && Number.isFinite(cap) && cap > 0;

// Highest first; equal caps keep the Graveyard's order (Array.prototype.sort is stable).
export function podium(coins: GraveCoin[], caps: Record<string, number>): PodiumSpot[] {
  return coins
    .filter((c) => known(caps[c.mint]))
    .sort((a, b) => caps[b.mint] - caps[a.mint])
    .slice(0, 3)
    .map((coin, i) => ({ coin, cap: caps[coin.mint], rank: (i + 1) as 1 | 2 | 3 }));
}

// Which way a market cap moved between two reads; null when it did not move or either read is missing.
export function trend(previous: number | undefined, next: number | undefined): "up" | "down" | null {
  if (previous === undefined || next === undefined || previous === next) return null;
  return next > previous ? "up" : "down";
}
