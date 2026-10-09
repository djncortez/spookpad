"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { introFrame, progressAt, randomPick } from "@/lib/intro";
import { SHOWCASE } from "@/lib/showcase";
import { useFx, useVisibility, useWebGL, useWide } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";
import { HeroCopy } from "./HeroCopy";

const IntroScene = dynamic(() => import("./IntroScene"), { ssr: false });

const WAKE_EVENTS = ["scroll", "wheel", "pointermove", "pointerdown", "touchstart", "keydown"] as const;

// True from the visitor's first scroll, touch, key or mouse movement (or at once when the page opens already scrolled).
// The 3D scene waits for it: building it right after load kept a phone's main thread busy for about a second, and
// until then the stage shows the same picture as today's hero anyway.
function useWoken(): boolean {
  const [woken, setWoken] = useState(false);
  useEffect(() => {
    const wake = () => setWoken(true);
    if (window.scrollY > 0) { requestAnimationFrame(wake); return; }
    for (const e of WAKE_EVENTS) window.addEventListener(e, wake, { once: true, passive: true });
    return () => { for (const e of WAKE_EVENTS) window.removeEventListener(e, wake); };
  }, []);
  return woken;
}

// Rendered by FxBoundary when the scene throws: tells the stage to fold back to one screen.
function SceneFailed({ onFail }: { onFail(): void }) {
  useEffect(() => { onFail(); }, [onFail]);
  return null;
}

// The hero and scroll intro (spec 2026-10-09-spookpad-intro-stage-design.md). The server render is already the final
// layout: CSS makes the section 600 svh tall with a sticky stage when motion is allowed (.intro-tall), and one screen
// otherwise, so nothing is swapped or resized after load. Scroll progress drives the 3D scene and the text; until the
// scene has drawn the mascot, the stage is today's hero (headline, buttons, picture cycle). Without WebGL, or if the
// scene fails, the section folds to one screen (.intro-flat).
export function IntroStage() {
  const fx = useFx();
  const animate = fx.animate && fx.ready; // as today's hero: reduced-motion users never see an animated first frame
  const wide = useWide();
  const webgl = useWebGL();
  const ref = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const progress = useRef(0);
  const readyRef = useRef(false);
  const [pick] = useState(randomPick); // a different costume on each visit
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [wearing, setWearing] = useState(-1);
  const { active } = useVisibility(ref, "0px");
  const woken = useWoken();
  const flat = failed || webgl === false;

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
    if (said.current) said.current.style.opacity = readyRef.current ? String(f.textOut) : "0";
    if (readyRef.current) setWearing(f.wearing);
  }, [pick]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
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
  const onFail = useCallback(() => setFailed(true), []);

  const chosen = wearing >= 0 ? SHOWCASE[wearing + 1].label : "";
  return (
    <section ref={ref} aria-label="SpookPad" className={`intro-bleed intro-tall relative ${flat ? "intro-flat" : ""}`}>
      <div className="intro-stage sticky top-0 isolate grid overflow-hidden pt-[var(--header-h,4.5rem)]">
        <HeroBackground webgl={fx.heroWebGL} paused={!active} />
        {fx.intro3d && woken && !flat && (
          <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
            <FxBoundary fallback={<SceneFailed onFail={onFail} />}>
              <IntroScene progress={progress} pick={pick} active={active} wide={wide} onReady={onReady} />
            </FxBoundary>
          </div>
        )}
        <div className="relative mx-auto grid w-full max-w-5xl content-start items-center gap-8 px-4 pb-16 pt-4 md:content-center md:pt-0 md:grid-cols-[1.15fr_1fr] md:gap-10">
          <div ref={copy} className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
            <HeroCopy animate={animate} />
          </div>
          {/* today's picture holds the mascot's place until the 3D mascot is drawn, then fades out */}
          <div className={`transition-opacity duration-700 motion-reduce:transition-none ${ready ? "pointer-events-none opacity-0" : ""}`}>
            <CostumeMorph animate={animate} active={active && !ready} />
          </div>
        </div>
        <p ref={said} aria-live="polite" className="absolute inset-x-0 bottom-16 text-center font-display text-2xl text-ghost opacity-0">
          {chosen && `It chose the ${chosen}`}
        </p>
        {/* one-screen hero (reduced motion, no WebGL): today's scroll-down arrow; the tall intro: a Skip intro link */}
        <a href="#stats" className={`${flat ? "" : "hidden motion-reduce:block"} absolute bottom-6 left-1/2 -translate-x-1/2 text-2xl text-muted motion-safe:animate-bounce`}>
          <span aria-hidden>↓</span>
          <span className="sr-only">Scroll down</span>
        </a>
        {!flat && (
          <a href="#stats" className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-line bg-night/60 px-4 py-1.5 text-sm text-muted backdrop-blur hover:text-ghost focus-visible:outline-2 focus-visible:outline-ghost motion-reduce:hidden">
            Skip intro
          </a>
        )}
      </div>
    </section>
  );
}
