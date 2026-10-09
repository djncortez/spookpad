"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { introFrame, INTRO_SVH, progressAt, randomPick } from "@/lib/intro";
import { SHOWCASE } from "@/lib/showcase";
import { useFx, useVisibility, useWide } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";
import { HeroCopy } from "./HeroCopy";

const IntroScene = dynamic(() => import("./IntroScene"), { ssr: false });

// The scroll intro (spec 2026-10-09-spookpad-intro-stage-design.md): a tall section with a sticky stage. Scroll
// progress drives the 3D scene and the text. Until the scene has drawn the mascot, the stage looks like today's hero.
export function IntroStage() {
  const fx = useFx();
  const wide = useWide();
  const ref = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const progress = useRef(0);
  const readyRef = useRef(false);
  const [pick] = useState(randomPick); // a different costume on each visit
  const [ready, setReady] = useState(false);
  const [wearing, setWearing] = useState(-1);
  const { active } = useVisibility(ref, "0px");

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const p = progressAt(box.top, box.height, window.innerHeight);
    progress.current = p;
    const f = introFrame(p, pick);
    const c = copy.current;
    if (c) {
      // the text stays put until the scene is up, so the stage never shows an empty screen
      const opacity = readyRef.current ? Math.max(f.textIn, f.textOut) : 1;
      c.style.opacity = String(opacity);
      c.inert = opacity < 0.1;
    }
    if (said.current) said.current.style.opacity = String(f.textOut);
    setWearing(f.wearing);
  }, [pick]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    onScroll(); // the first position (a reload can land mid-intro)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [update]);

  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
    update();
  }, [update]);

  const chosen = wearing >= 0 ? SHOWCASE[wearing + 1].label : "";
  return (
    <section ref={ref} aria-label="SpookPad" className="intro-bleed relative" style={{ height: `${INTRO_SVH}svh` }}>
      <div className="sticky top-0 isolate h-[100svh] overflow-hidden pt-[var(--header-h,4.5rem)]">
        <HeroBackground webgl={fx.heroWebGL} paused={!active} />
        <div className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}>
          <IntroScene progress={progress} pick={pick} active={active} wide={wide} onReady={onReady} />
        </div>
        <div className="relative mx-auto grid h-full w-full max-w-5xl content-start items-center gap-8 px-4 pb-16 pt-4 md:content-center md:pt-0 md:grid-cols-[1.15fr_1fr] md:gap-10">
          <div ref={copy} className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
            <HeroCopy animate />
          </div>
          {/* today's picture holds the mascot's place until the 3D mascot is drawn, then fades out */}
          <div className={`transition-opacity duration-700 motion-reduce:transition-none ${ready ? "pointer-events-none opacity-0" : ""}`}>
            <CostumeMorph animate active={active && !ready} />
          </div>
        </div>
        <p ref={said} aria-live="polite" className="absolute inset-x-0 bottom-16 text-center font-display text-2xl text-ghost opacity-0">
          {chosen && `It chose the ${chosen}`}
        </p>
        <a href="#stats" className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-line bg-night/60 px-4 py-1.5 text-sm text-muted backdrop-blur hover:text-ghost focus-visible:outline-2 focus-visible:outline-ghost">
          Skip intro
        </a>
      </div>
    </section>
  );
}
