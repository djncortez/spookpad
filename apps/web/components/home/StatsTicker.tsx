"use client";
import { useEffect, useState } from "react";
import CountUp from "@/components/bits/CountUp";
import ScrollVelocity from "@/components/bits/ScrollVelocity";
import { fetchGraveyard } from "@/lib/graveyard";
import { fetchCostumes, fetchStats, type Stats } from "@/lib/public-data";
import { compactCount, formatCount, tickerLine } from "@/lib/stats";
import { useFx } from "@/lib/use-fx";

// Counters (coins launched, costumes summoned, costumes available) and a ticker of the newest coins.
export function StatsTicker() {
  const fx = useFx();
  const still = !(fx.animate && fx.ready);
  const [stats, setStats] = useState<Stats | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchStats().then((s) => alive && setStats(s)).catch(() => {}); // unknown numbers show as —
    fetchCostumes().then((c) => alive && setAvailable(c.length)).catch(() => {});
    fetchGraveyard(12).then((coins) => alive && setLine(tickerLine(coins))).catch(() => {});
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
              <Counter value={n} still={still} />
            </dd>
          </div>
        ))}
      </dl>
      {line && <Ticker line={line} still={still} />}
    </section>
  );
}

function Counter({ value, still }: { value: number | null; still: boolean }) {
  if (value === null || still) return <>{formatCount(value)}</>;
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

function Ticker({ line, still }: { line: string; still: boolean }) {
  return (
    <div className="full-bleed border-y border-line bg-night-2/60 py-3">
      <p className="sr-only">Newest coins: {line}</p>
      {still ? (
        <p aria-hidden className="truncate px-4 text-center font-display text-3xl text-ghost/90">{line}</p>
      ) : (
        <div aria-hidden>
          <ScrollVelocity texts={[line]} velocity={40} numCopies={4} scrollerClassName="font-display text-3xl text-ghost/90 sm:text-5xl" />
        </div>
      )}
    </div>
  );
}
