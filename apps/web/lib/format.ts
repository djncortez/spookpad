import { lamportsToSol } from "@spookpad/core/sol";

export const shortAddress = (a: string): string => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const solText = (lamports: number): string => `${lamportsToSol(lamports)} SOL`;

export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${Number((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000) return `$${Number((n / 1_000).toFixed(1))}K`;
  return `$${Math.round(n)}`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
