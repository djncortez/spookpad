"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { artUrl } from "@/lib/art";
import { publicEnv } from "@/lib/env";
import { formatUsd, shortAddress, timeAgo } from "@/lib/format";
import { fetchCoin, type GraveCoin } from "@/lib/graveyard";
import { watchMarketCap } from "@/lib/live-mcap";
import { fetchCostumes } from "@/lib/public-data";
import { LaunchParty } from "./LaunchParty";
import { RevealSlider } from "./RevealSlider";
import { ShareButtons } from "./ShareButtons";

// A new mint remounts the details, so nothing of the previous coin (details, cap, LIVE badge) is ever shown for it.
export function CoinView() {
  const params = useSearchParams();
  const mint = params.get("mint") ?? "";
  return <CoinDetails key={mint} mint={mint} party={params.get("party") === "1"} />;
}

function CoinDetails({ mint, party }: { mint: string; party: boolean }) {
  const [coin, setCoin] = useState<GraveCoin | null | undefined>(undefined);
  const [cap, setCap] = useState<number | undefined>(undefined);
  const [live, setLive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [costume, setCostume] = useState<string | undefined>(undefined);
  // the launch party plays once: right after a launch (LaunchWizard adds party=1), never on a reload or a shared link
  const [showParty, setShowParty] = useState(party);
  const closeParty = useCallback(() => setShowParty(false), []);

  useEffect(() => {
    if (party) window.history.replaceState(null, "", `/coin/?mint=${mint}`);
  }, [party, mint]);

  useEffect(() => {
    let alive = true;
    fetchCoin(mint).then((c) => alive && setCoin(c)).catch(() => alive && setCoin(null));
    return () => { alive = false; };
  }, [mint]);

  useEffect(() => {
    if (!coin) return;
    let alive = true;
    fetchCostumes().then((list) => alive && setCostume(list.find((c) => c.slug === coin.costume)?.label)).catch(() => {});
    return () => { alive = false; };
  }, [coin]);

  // the $NOOB live engine; never opened or kept open while the tab is hidden (saves Helius credits), opened when visible
  useEffect(() => {
    if (!coin) return;
    let stop: (() => void) | null = null;
    const start = () => {
      stop?.();
      stop = null;
      if (document.hidden) return;
      stop = watchMarketCap({ ca: coin.mint, rpcUrl: publicEnv.solanaRpcUrl, onUpdate: (mc, source) => { setCap(mc); setLive(source === "chain"); } });
    };
    const onVisibility = () => { if (document.hidden) { stop?.(); stop = null; } else start(); };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop?.(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [coin]);

  if (coin === undefined) return <p className="text-muted">Summoning the coin…</p>;
  if (coin === null) {
    return <p className="text-muted">This coin isn&apos;t in the Graveyard yet. If you just launched it, give Solana a minute and reload.</p>;
  }
  return (
    <article className="grid gap-6 md:grid-cols-2">
      {showParty && <LaunchParty coin={coin} costume={costume} onClose={closeParty} />}
      <RevealSlider before={artUrl(coin.original_path) ?? ""} after={artUrl(coin.result_path) ?? ""} alt={coin.name} />
      <div className="grid content-start gap-4">
        <h1 className="font-display text-5xl text-pumpkin">{coin.name} <span className="font-mono text-2xl text-ghost">${coin.ticker}</span></h1>
        {coin.description && <p className="text-lg">{coin.description}</p>}
        <dl className="grid grid-cols-2 gap-3">
          <div className="card p-3">
            <dt className="flex items-center gap-2 text-sm text-muted">
              Market cap {live && <span className="rounded-full bg-slime px-2 text-xs font-bold text-night">LIVE</span>}
            </dt>
            <dd className="text-xl font-bold" aria-live="polite">{cap === undefined ? "…" : formatUsd(cap)}</dd>
          </div>
          <div className="card p-3"><dt className="text-sm text-muted">Launched</dt><dd className="text-xl font-bold">{timeAgo(coin.launched_at)}</dd></div>
          <div className="card p-3"><dt className="text-sm text-muted">Creator</dt><dd className="font-mono">{shortAddress(coin.wallet)}</dd></div>
          <div className="card p-3">
            <dt className="text-sm text-muted">Contract</dt>
            <dd><button className="font-mono underline" onClick={() => { void navigator.clipboard.writeText(coin.mint); setCopied(true); }}>{copied ? "Copied!" : shortAddress(coin.mint)}</button></dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <a className="btn" href={`https://pump.fun/coin/${coin.mint}`} target="_blank" rel="noreferrer">Trade on pump.fun</a>
          <ShareButtons coin={coin} costume={costume} />
          <a className="btn btn-ghost" href={`https://dexscreener.com/solana/${coin.mint}`} target="_blank" rel="noreferrer">DEX Screener</a>
          {coin.twitter && <a className="btn btn-ghost" href={coin.twitter} target="_blank" rel="noreferrer">X</a>}
          {coin.telegram && <a className="btn btn-ghost" href={coin.telegram} target="_blank" rel="noreferrer">Telegram</a>}
        </div>
      </div>
    </article>
  );
}
