"use client";
import Link from "next/link";
import { useState } from "react";
import { artUrl } from "@/lib/art";
import { formatUsd, timeAgo } from "@/lib/format";
import type { GraveCoin } from "@/lib/graveyard";
import SpotlightCard from "./bits/SpotlightCard";
import TiltedCard from "./bits/TiltedCard";

// A Graveyard coin: tilts and glows under the mouse; hovering (tapping the picture on touch) peeks at the original
// image. The original loads only when first peeked at. Data and market cap are shown exactly as before.
export function CoinCard({ coin, cap, emoji, touch = false, still = false }: {
  coin: GraveCoin; cap: number | undefined; emoji?: string; touch?: boolean; still?: boolean;
}) {
  const [peek, setPeek] = useState(false);
  const href = `/coin/?mint=${coin.mint}`;
  const art = (
    <div className="relative aspect-square bg-night">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={artUrl(coin.result_path) ?? ""} alt={`${coin.name} in costume`} loading="lazy" className="h-full w-full object-cover" />
      {peek && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artUrl(coin.original_path) ?? ""} alt={`${coin.name} without its costume`} className="peek-in absolute inset-0 h-full w-full object-cover" />
      )}
      {emoji && <span aria-hidden className="absolute right-2 top-2 rounded-full bg-night/80 px-2 py-1 text-lg">{emoji}</span>}
      {touch && (
        <span aria-hidden className="absolute bottom-2 left-2 rounded-full bg-night/80 px-2 py-0.5 text-xs">{peek ? "Costume" : "Tap to peek"}</span>
      )}
    </div>
  );
  const info = (
    <div className="grid gap-1 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-bold">{coin.name}</span>
        <span className="font-mono text-sm text-pumpkin">${coin.ticker}</span>
      </div>
      <div className="flex justify-between text-sm text-muted">
        <span>MC {formatUsd(cap)}</span>
        <span>{timeAgo(coin.launched_at)}</span>
      </div>
    </div>
  );
  return (
    <TiltedCard disabled={touch || still} className="h-full">
      <SpotlightCard spotlightColor="#ff7a1a" proximity={0} intensity={0.22} borderGlow={0.9} className="h-full rounded-[1.25rem]">
        {touch ? (
          <>
            <button type="button" aria-pressed={peek} aria-label={`Peek under ${coin.name}'s costume`} onClick={() => setPeek((p) => !p)} className="block w-full">
              {art}
            </button>
            <Link href={href} className="block">{info}</Link>
          </>
        ) : (
          <Link href={href} className="block" onMouseEnter={() => setPeek(true)} onMouseLeave={() => setPeek(false)} onFocus={() => setPeek(true)} onBlur={() => setPeek(false)}>
            {art}
            {info}
          </Link>
        )}
      </SpotlightCard>
    </TiltedCard>
  );
}
