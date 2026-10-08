"use client";
import { useEffect, useMemo, useState } from "react";
import { publicEnv } from "@/lib/env";
import { graveyardCaps } from "@/lib/graveyard-caps";
import { fetchGraveyard, sortCoins, type GraveCoin } from "@/lib/graveyard";
import { fetchCostumes, type Costume } from "@/lib/public-data";
import { CoinCard } from "./CoinCard";

const LIST_MS = 60_000; // new launches
const CAPS_MS = 15_000; // market caps (one batched chain read)

export function Graveyard() {
  const [coins, setCoins] = useState<GraveCoin[] | null>(null);
  const [caps, setCaps] = useState<Record<string, number>>({});
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [by, setBy] = useState<"new" | "cap">("new");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchGraveyard().then((list) => alive && setCoins(list), (e: Error) => alive && setError(e.message));
    void load();
    fetchCostumes().then((c) => alive && setCostumes(c)).catch(() => {});
    const timer = setInterval(() => { if (!document.hidden) void load(); }, LIST_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!coins?.length) return;
    let alive = true;
    const mints = coins.map((c) => c.mint);
    const read = () => { if (!document.hidden) void graveyardCaps(mints, publicEnv.solanaRpcUrl).then((m) => alive && setCaps(m)); };
    read();
    const timer = setInterval(read, CAPS_MS);
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [coins]);

  const sorted = useMemo(() => (coins ? sortCoins(coins, caps, by) : []), [coins, caps, by]);
  const emoji = (slug: string) => costumes.find((c) => c.slug === slug)?.emoji;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-4xl">The Graveyard</h2>
        <div role="tablist" aria-label="Sort" className="flex gap-2">
          {(["new", "cap"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={by === k} onClick={() => setBy(k)} className={by === k ? "btn px-4 py-1.5" : "btn btn-ghost px-4 py-1.5"}>
              {k === "new" ? "Newest" : "Market cap"}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-blood">{error}</p>}
      {coins === null && !error && <p className="text-muted">Digging up coins…</p>}
      {coins?.length === 0 && <p className="text-muted">No coins yet. Be the first to rise from the grave.</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((c) => <CoinCard key={c.mint} coin={c} cap={caps[c.mint]} emoji={emoji(c.costume)} />)}
      </div>
    </section>
  );
}
