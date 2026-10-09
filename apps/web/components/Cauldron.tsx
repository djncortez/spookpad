"use client";
import { useEffect, useState } from "react";
import { BREW_EVERY_MS, brewLine } from "@/lib/brew";

// A bubbling cauldron (SVG + CSS, globals.css .cauldron-*) with rotating spooky lines, shown while the AI works.
// Decorative: the text that matters ("Brewing…", the status bar) is next to it, so it is aria-hidden.
export function Cauldron({ compact = false }: { compact?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // no rotating lines under reduced motion, and none while the tab is hidden
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, BREW_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <span aria-hidden className={`grid justify-items-center gap-1 text-center ${compact ? "w-14 shrink-0" : ""}`}>
      <svg viewBox="0 0 120 100" className={compact ? "h-12 w-14" : "h-20 w-24"}>
        <g className="cauldron-bubbles" fill="#9be15d">
          <circle cx="45" cy="38" r="5" />
          <circle cx="62" cy="34" r="4" />
          <circle cx="75" cy="40" r="6" />
        </g>
        <ellipse cx="60" cy="44" rx="40" ry="8" fill="#9be15d" opacity=".85" />
        <path d="M18 46 Q18 92 60 92 Q102 92 102 46 Z" fill="#171124" stroke="#2c2340" strokeWidth="3" />
        <rect x="14" y="40" width="92" height="8" rx="4" fill="#2c2340" />
        <g className="cauldron-fire" fill="#ff7a1a">
          <path d="M44 99 q6 -12 12 0 z" />
          <path d="M58 99 q6 -15 12 0 z" />
          <path d="M72 99 q5 -10 10 0 z" />
        </g>
      </svg>
      {!compact && <span className="text-xs font-semibold">{brewLine(tick)}</span>}
    </span>
  );
}
