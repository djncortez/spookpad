"use client";
import Link from "next/link";
import { useRef } from "react";
import SplitText from "@/components/bits/SplitText";
import { useFx, useIdleReady, useVisibility } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";

const TITLE = "Every coin wears a costume";
const TITLE_CLASS = "font-display text-5xl leading-[1.05] text-pumpkin sm:text-7xl";

// Full-viewport opening: what SpookPad does, in a few seconds.
export function Hero() {
  const fx = useFx();
  // Motion starts only once the page is ready (not from the plan alone), so reduced-motion users never see an animated first frame.
  const ready = useIdleReady();
  const animate = fx.animate && ready;
  const ref = useRef<HTMLElement>(null);
  const { active } = useVisibility(ref, "0px");
  return (
    <section ref={ref} aria-label="SpookPad" className="hero-bleed relative isolate grid min-h-[100svh] content-center overflow-hidden">
      <HeroBackground webgl={fx.heroWebGL} paused={!active} />
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-8 sm:py-12 md:grid-cols-[1.15fr_1fr] md:gap-10">
        <div className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
          {animate ? (
            <SplitText tag="h1" text={TITLE} className={TITLE_CLASS} splitType="words, chars" delay={35} duration={0.9} textAlign="inherit" />
          ) : (
            <h1 className={TITLE_CLASS}>{TITLE}</h1>
          )}
          <p className="max-w-xl text-lg text-muted">
            Upload your mascot, pick a Halloween costume, and AI dresses it up. Then launch it on pump.fun from your own wallet.
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:justify-start">
            <Link href="/launch/" className="btn text-lg">Launch a coin</Link>
            <a href="#graveyard" className="btn btn-ghost text-lg">See the Graveyard</a>
          </div>
        </div>
        <CostumeMorph animate={animate} active={active} />
      </div>
      <a href="#stats" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-2xl text-muted motion-safe:animate-bounce">
        <span aria-hidden>↓</span>
        <span className="sr-only">Scroll down</span>
      </a>
    </section>
  );
}
