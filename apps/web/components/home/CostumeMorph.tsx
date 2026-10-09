"use client";
import { useEffect, useState } from "react";
import PixelTransition from "@/components/bits/PixelTransition";
import { CYCLE_MS, heroFrame, heroIndex, SHOWCASE, STILL_INDEX } from "@/lib/showcase";

// The mascot trying on every costume, one every 3 s, with a pixel dissolve (fixed-size box: no layout shift).
// Starts on the ghost costume (same as the still), then witch, ... devil, plain, ghost. Still (reduced motion): the ghost costume. Paused while off screen or while the tab is hidden.
export function CostumeMorph({ animate, active }: { animate: boolean; active: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!animate || !active) return;
    const timer = setInterval(() => setStep((s) => s + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [animate, active]);
  useEffect(() => {
    if (!animate) return;
    for (const c of SHOWCASE) new Image().src = c.src; // warm the cache so every swap is instant
  }, [animate]);

  const frame = heroFrame(step, SHOWCASE.length);
  const shown = SHOWCASE[animate ? heroIndex(frame.current) : STILL_INDEX];
  // `index` is a SHOWCASE index: the animated slots map through heroIndex, the still uses STILL_INDEX as-is.
  const art = (index: number, first = false) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SHOWCASE[index].src} alt="" width={768} height={768} fetchPriority={first ? "high" : "auto"} className="h-full w-full object-cover" />
  );

  return (
    <figure className="grid justify-items-center gap-3" aria-label="The SpookPad mascot trying on costumes">
      <div className="relative aspect-square w-[min(68vw,380px)] overflow-hidden rounded-[2rem] border border-line bg-night-2 shadow-[0_0_80px_#ff7a1a33]">
        {animate ? (
          <PixelTransition
            active={frame.showB}
            firstContent={art(heroIndex(frame.slotA), step === 0)}
            secondContent={art(heroIndex(frame.slotB))}
            gridSize={12}
            pixelColor="#ff7a1a"
            animationStepDuration={0.45}
            className="h-full w-full"
          />
        ) : (
          art(STILL_INDEX, true)
        )}
      </div>
      <figcaption className="font-display text-2xl text-ghost">
        <span aria-hidden>{shown.emoji}</span> {shown.label}
      </figcaption>
    </figure>
  );
}
