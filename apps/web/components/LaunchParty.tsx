"use client";
import { useEffect, useRef, useState } from "react";
import { artUrl } from "@/lib/art";
import type { GraveCoin } from "@/lib/graveyard";
import { useReducedMotion } from "@/lib/use-fx";
import { ShareButtons } from "./ShareButtons";

const COLORS = ["#ff7a1a", "#ffb347", "#ff4d6d", "#b497cf", "#9be15d"];
const BURST_S = 1.8;

// A one-off burst of sparks and a few bats from the middle of the screen (canvas, no dependency).
function Burst({ onDone }: { onDone(): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) { done.current(); return; }
    const w = (c.width = document.documentElement.clientWidth);
    const h = (c.height = window.innerHeight);
    const cx = w / 2, cy = h * 0.4;
    const sparks = Array.from({ length: 110 }, (_, i) => {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, r: 2 + Math.random() * 3, color: COLORS[i % COLORS.length] };
    });
    const bats = Array.from({ length: 7 }, (_, i) => ({ x: cx, y: cy, vx: (i - 3) * 2.2 + (Math.random() - 0.5), vy: -3 - Math.random() * 3, s: 14 + Math.random() * 10, phase: Math.random() * 6 }));
    const bat = (x: number, y: number, s: number, flap: number) => {
      g.save();
      g.translate(x, y);
      g.scale(s / 20, (s / 20) * (0.55 + 0.45 * Math.abs(Math.sin(flap))));
      g.beginPath();
      g.moveTo(-20, -2);
      g.quadraticCurveTo(-14, -10, -8, -4);
      g.quadraticCurveTo(-4, -8, 0, -4);
      g.quadraticCurveTo(4, -8, 8, -4);
      g.quadraticCurveTo(14, -10, 20, -2);
      g.quadraticCurveTo(14, 2, 10, 6);
      g.quadraticCurveTo(6, 2, 0, 8);
      g.quadraticCurveTo(-6, 2, -10, 6);
      g.quadraticCurveTo(-14, 2, -20, -2);
      g.closePath();
      g.fillStyle = "#2a1846";
      g.strokeStyle = "#ff7a1a";
      g.lineWidth = 1.5;
      g.fill();
      g.stroke();
      g.restore();
    };
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      if (t > BURST_S) { done.current(); return; }
      raf = requestAnimationFrame(frame);
      g.clearRect(0, 0, w, h);
      g.globalAlpha = 1 - t / BURST_S;
      for (const p of sparks) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.985;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }
      for (const b of bats) { b.x += b.vx; b.y += b.vy; b.vy -= 0.03; bat(b.x, b.y, b.s, b.phase + t * 18); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />;
}

// The launch party (spec 2026-10-09-spookpad-podium-party-design.md): shown once over the coin page right after a
// launch, with the share buttons. Escape, Close or a click outside closes it.
export function LaunchParty({ coin, costume, onClose }: { coin: GraveCoin; costume: string | undefined; onClose(): void }) {
  const still = useReducedMotion();
  const [burst, setBurst] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center overflow-y-auto bg-night/80 p-4 backdrop-blur-sm" onClick={onClose}>
      {!still && burst && <Burst onDone={() => setBurst(false)} />}
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="party-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="card dissolve-in grid w-full max-w-md justify-items-center gap-4 p-6 text-center outline-none"
      >
        <h2 id="party-title" className="font-display text-5xl text-pumpkin">It&apos;s alive!</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artUrl(coin.result_path) ?? ""} alt={`${coin.name} in costume`} className="w-48 rounded-2xl border-2 border-pumpkin shadow-[0_0_40px_#ff7a1a66] sm:w-56" />
        <p className="text-2xl font-bold">{coin.name} <span className="font-mono text-pumpkin">${coin.ticker}</span></p>
        <p className="text-muted">{costume ? `Dressed as a ${costume}` : "In costume"} and live on pump.fun. Tell the world:</p>
        <ShareButtons coin={coin} costume={costume} full />
        <button type="button" className="text-sm text-muted underline hover:text-ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
