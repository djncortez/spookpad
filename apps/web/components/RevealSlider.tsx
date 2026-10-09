"use client";
import { useState } from "react";

// The costume over the original: drag to peek under the costume. Same props and behaviour; restyled with a pumpkin
// divider and handle that follow the slider, and corner labels.
export function RevealSlider({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(100);
  return (
    <div className="grid gap-2">
      <div className="card relative aspect-square overflow-hidden shadow-[0_0_40px_#ff7a1a22]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt} without its costume`} className="absolute inset-0 h-full w-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={`${alt} in costume`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-pumpkin shadow-[0_0_12px_#ff7a1a]" style={{ left: `${pos}%` }}>
          <span style={{ transform: `translate(calc(-50% + ${(50 - pos) * 0.36}px), -50%)` }} className="absolute left-1/2 top-1/2 grid h-9 w-9 place-items-center rounded-full bg-pumpkin text-sm font-bold text-night">⇆</span>
        </div>
        <span aria-hidden className="absolute left-3 top-3 rounded-full bg-night/80 px-2 py-0.5 text-xs">Costume</span>
        <span aria-hidden className="absolute right-3 top-3 rounded-full bg-night/80 px-2 py-0.5 text-xs">Original</span>
      </div>
      <label className="label">
        Peek under the costume
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="reveal-range" />
      </label>
    </div>
  );
}
