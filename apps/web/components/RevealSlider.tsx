"use client";
import { useState } from "react";

// The costume over the original: drag to peek under the costume.
export function RevealSlider({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(100);
  return (
    <div className="grid gap-2">
      <div className="card relative aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt} without its costume`} className="absolute inset-0 h-full w-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={`${alt} in costume`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      </div>
      <label className="label">
        Peek under the costume
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="accent-[#ff7a1a]" />
      </label>
    </div>
  );
}
