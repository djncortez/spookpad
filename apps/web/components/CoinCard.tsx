import Link from "next/link";
import { artUrl } from "@/lib/art";
import { formatUsd, timeAgo } from "@/lib/format";
import type { GraveCoin } from "@/lib/graveyard";

export function CoinCard({ coin, cap, emoji }: { coin: GraveCoin; cap: number | undefined; emoji?: string }) {
  return (
    <Link href={`/coin/?mint=${coin.mint}`} className="card group overflow-hidden transition hover:-translate-y-1 hover:border-pumpkin">
      <div className="relative aspect-square bg-night">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artUrl(coin.result_path) ?? ""} alt={`${coin.name} in costume`} loading="lazy" className="h-full w-full object-cover" />
        {emoji && <span aria-hidden className="absolute right-2 top-2 rounded-full bg-night/80 px-2 py-1 text-lg">{emoji}</span>}
      </div>
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
    </Link>
  );
}
