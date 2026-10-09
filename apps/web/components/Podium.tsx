"use client";
import Link from "next/link";
import { artUrl } from "@/lib/art";
import { formatUsd } from "@/lib/format";
import type { PodiumSpot } from "@/lib/podium";

// mint -> which way its market cap moved on the last read
export type Moves = Record<string, "up" | "down">;

const STYLE = {
  1: { label: "1st", plinth: "h-20 sm:h-28", color: "#f5c242", art: "w-24 sm:w-40", col: "col-start-2" },
  2: { label: "2nd", plinth: "h-12 sm:h-20", color: "#c9d1e0", art: "w-20 sm:w-32", col: "col-start-1" },
  3: { label: "3rd", plinth: "h-8 sm:h-14", color: "#d0874f", art: "w-20 sm:w-32", col: "col-start-3" },
} as const;

function Crown() {
  return (
    <svg aria-hidden viewBox="0 0 64 40" className="mx-auto -mb-1 w-10 drop-shadow-[0_0_10px_#f5c242aa] sm:w-14">
      <path d="M4 36 L8 10 L22 22 L32 4 L42 22 L56 10 L60 36 Z" fill="#f5c242" stroke="#8a5a00" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="8" cy="10" r="4" fill="#ff7a1a" />
      <circle cx="32" cy="4" r="4" fill="#ff4d6d" />
      <circle cx="56" cy="10" r="4" fill="#ff7a1a" />
    </svg>
  );
}

// Kings of the Graveyard (spec 2026-10-09-spookpad-podium-party-design.md): the top three market caps on a podium,
// 2nd - 1st - 3rd. A cap that just moved shows a green or red arrow for a moment. An empty spot invites a launch.
export function Podium({ spots, moves }: { spots: PodiumSpot[]; moves: Moves }) {
  const open = ([2, 1, 3] as const).filter((rank) => !spots.some((s) => s.rank === rank));
  return (
    <div className="mb-6 grid gap-4">
      <h2 className="text-center font-display text-4xl text-pumpkin sm:text-5xl">Kings of the Graveyard</h2>
      <ol aria-label="Highest market caps" className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {spots.map(({ coin, cap, rank }) => {
          const s = STYLE[rank];
          const move = moves[coin.mint];
          return (
            <li key={coin.mint} className={`${s.col} row-start-1 grid min-w-0 justify-items-center gap-2`}>
              <span className="sr-only">{s.label}:</span>
              <Link href={`/coin/?mint=${coin.mint}`} className="group grid w-full min-w-0 justify-items-center gap-1 rounded-2xl p-1 text-center focus-visible:outline-2 focus-visible:outline-ghost">
                {rank === 1 && <Crown />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artUrl(coin.result_path) ?? ""}
                  alt={`${coin.name} in costume`}
                  loading="lazy"
                  className={`${s.art} aspect-square max-w-full rounded-2xl border-2 object-cover transition-transform duration-200 motion-safe:group-hover:-translate-y-1`}
                  style={{ borderColor: s.color, boxShadow: `0 0 28px ${s.color}66` }}
                />
                <span className="w-full truncate font-bold">{coin.name}</span>
                <span className="font-mono text-xs text-pumpkin sm:text-sm">${coin.ticker}</span>
                <span className={`text-sm font-bold sm:text-lg ${move === "up" ? "text-slime" : move === "down" ? "text-blood" : ""} ${move ? "motion-safe:animate-pulse" : ""}`}>
                  {formatUsd(cap)}
                  {move && <span aria-label={move === "up" ? " up" : " down"}> {move === "up" ? "▲" : "▼"}</span>}
                </span>
              </Link>
              <div
                aria-hidden
                className={`${s.plinth} grid w-full place-items-center rounded-t-xl border-x border-t font-display text-2xl sm:text-3xl`}
                style={{ borderColor: s.color, color: s.color, background: `linear-gradient(to bottom, ${s.color}33, transparent)` }}
              >
                {s.label}
              </div>
            </li>
          );
        })}
        {open.map((rank) => {
          const s = STYLE[rank];
          return (
            <li key={rank} className={`${s.col} row-start-1 grid min-w-0 justify-items-center gap-2`}>
              <Link href="/launch/" className="grid w-full justify-items-center gap-1 rounded-2xl p-1 text-center text-muted hover:text-ghost focus-visible:outline-2 focus-visible:outline-ghost">
                <span className={`${s.art} grid aspect-square max-w-full place-items-center rounded-2xl border-2 border-dashed text-3xl`} style={{ borderColor: `${s.color}88` }} aria-hidden>?</span>
                <span className="font-bold">Your coin here</span>
                <span className="text-xs sm:text-sm">Launch a coin</span>
              </Link>
              <div aria-hidden className={`${s.plinth} grid w-full place-items-center rounded-t-xl border-x border-t border-dashed font-display text-2xl opacity-60 sm:text-3xl`} style={{ borderColor: s.color, color: s.color }}>
                {s.label}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
