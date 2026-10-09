"use client";
import { useEffect, useRef, useState } from "react";
import CountUp from "@/components/bits/CountUp";
import ScrollVelocity from "@/components/bits/ScrollVelocity";
import { fetchGraveyard } from "@/lib/graveyard";
import { fetchCostumes, fetchStats, type Stats } from "@/lib/public-data";
import { compactCount, fillTicker, formatCount, spokenTicker, tickerLine } from "@/lib/stats";
import { useFx, useVisibility } from "@/lib/use-fx";

// Counters (coins launched, costumes summoned, costumes available) and a ticker of the newest coins.
export function StatsTicker() {
  const fx = useFx();
  const still = !(fx.animate && fx.ready); // the ticker's static variant: reduced motion, or not ready yet
  const [stats, setStats] = useState<Stats | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [line, setLine] = useState<string | null | undefined>(undefined); // undefined: still loading, null: no coins
  useEffect(() => {
    let alive = true;
    fetchStats().then((s) => alive && setStats(s)).catch(() => {}); // unknown numbers show as —
    fetchCostumes().then((c) => alive && setAvailable(c.length)).catch(() => {});
    fetchGraveyard(12).then((coins) => alive && setLine(tickerLine(coins))).catch(() => alive && setLine(null));
    return () => { alive = false; };
  }, []);

  const counters: [string, number | null][] = [
    ["Coins launched", stats?.coins_launched ?? null],
    ["Costumes summoned", stats?.costumes_summoned ?? null],
    ["Costumes in the wardrobe", available],
  ];
  return (
    <section id="stats" aria-label="SpookPad in numbers" className="grid gap-8">
      <dl className="grid gap-4 sm:grid-cols-3">
        {counters.map(([label, n]) => (
          <div key={label} className="card grid gap-1 p-5 text-center">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="min-h-[3.75rem] font-display text-5xl tabular-nums text-pumpkin">
              <Counter value={n} animate={fx.animate} ready={fx.ready} />
            </dd>
          </div>
        ))}
      </dl>
      {line !== null && <Ticker line={line} still={still} />}
    </section>
  );
}

// Animated: "—" until the number and the page are both ready, then CountUp mounts once (never restarts).
// Reduced motion: the final number as soon as it arrives.
function Counter({ value, animate, ready }: { value: number | null; animate: boolean; ready: boolean }) {
  if (value === null || (animate && !ready)) return <>{formatCount(null)}</>;
  if (!animate) return <>{formatCount(value)}</>;
  const { to, suffix } = compactCount(value);
  return (
    <>
      <span aria-hidden>
        <CountUp to={to} separator="," duration={1.6} />
        {suffix}
      </span>
      <span className="sr-only">{formatCount(value)}</span>
    </>
  );
}

// The row has one fixed height and one text size/line height in every state (loading, static, animated), so nothing
// moves. While the coins load it is an empty band; with no coins it is removed (it is below the full-screen hero,
// so nothing visible shifts).
const ROW = "font-display text-3xl leading-[1.2] text-ghost/90 sm:text-5xl";
function Ticker({ line, still }: { line: string | undefined; still: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { active } = useVisibility(ref); // the animated scroller only runs while the band is on screen
  return (
    <div ref={ref} className="full-bleed flex h-[62px] items-center overflow-hidden border-y border-line bg-night-2/60 sm:h-[86px]">
      {line !== undefined && (
        <>
          <p className="sr-only">Newest coins: {spokenTicker(line)}</p>
          {still || !active ? (
            <p aria-hidden className={`w-full truncate px-4 text-center ${ROW}`}>{line}</p>
          ) : (
            <div aria-hidden className="w-full">
              <ScrollVelocity texts={[fillTicker(line)]} velocity={40} numCopies={4} scrollerClassName={ROW} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
