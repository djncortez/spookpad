"use client";
import { useEffect, useState } from "react";
import { artUrl } from "@/lib/art";
import type { Costume } from "@/lib/public-data";
import { msUntilRetryable, type Generation } from "@/lib/summon";
import { Cauldron } from "./Cauldron";

export function GenerationCard({ g, costume, selected, onSelect, onRetry, busy }: {
  g: Generation; costume?: Costume; selected: boolean; onSelect(): void; onRetry(): void; busy: boolean;
}) {
  const ready = g.state === "ready" && !g.launched;
  // a summon whose function died stays "generating"; after 3 minutes without a change the free retry takes it over
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const ms = msUntilRetryable(g, Date.now());
    const timer = setTimeout(() => setStuck(ms !== null), ms ?? 0);
    return () => clearTimeout(timer);
  }, [g.state, g.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = artUrl(g.result_path ?? g.original_path);
  return (
    <div className={`card overflow-hidden ${selected ? "border-pumpkin shadow-[0_0_24px_#ff7a1a55]" : ""}`}>
      <div className="relative aspect-square bg-night">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={`${costume?.label ?? g.costume} costume`} className={`h-full w-full object-cover ${g.result_path ? "dissolve-in" : "opacity-40 grayscale"}`} />}
        {!g.result_path && (
          <span className="absolute inset-0 grid place-items-center p-3 text-center text-sm font-semibold">
            {g.state === "failed" ? (g.error === "expired_paid" ? "Paid after it expired. SpookPad will refund your fee." : "Failed 3 times. SpookPad will refund your fee.") : g.state === "generating" ? (stuck ? "The spell got stuck" : <><Cauldron compact /><span className="sr-only">Brewing…</span></>) : "The spell fizzled"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-3 text-sm">
        <span>{costume?.label ?? g.costume}</span>
        {g.launched && <span className="text-slime">Launched</span>}
        {ready && (
          <button type="button" onClick={onSelect} className={selected ? "btn px-3 py-1 text-sm" : "btn-ghost btn px-3 py-1 text-sm"}>
            {selected ? "Chosen" : "Choose"}
          </button>
        )}
        {(g.state === "paid" || (g.state === "generating" && stuck)) && (
          <button type="button" onClick={onRetry} disabled={busy} className="btn px-3 py-1 text-sm">Try again (free)</button>
        )}
      </div>
    </div>
  );
}
