"use client";
import { useRef } from "react";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { useFx, useVisibility } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";
import { HeroCopy } from "./HeroCopy";
import { IntroStage } from "./IntroStage";

// The opening: the 3D scroll intro when it may run, else (server render, first paint, reduced motion, no WebGL, or
// the scene failing) today's full-viewport hero.
export function Hero() {
  const fx = useFx();
  const classic = <ClassicHero />;
  return fx.intro3d ? <FxBoundary fallback={classic}><IntroStage /></FxBoundary> : classic;
}

// Full-viewport opening: what SpookPad does, in a few seconds.
function ClassicHero() {
  const fx = useFx();
  // Motion starts only once the page is ready (not from the plan alone), so reduced-motion users never see an animated first frame.
  const animate = fx.animate && fx.ready;
  const ref = useRef<HTMLElement>(null);
  const { active } = useVisibility(ref, "0px");
  return (
    <section ref={ref} aria-label="SpookPad" className="hero-bleed relative isolate grid min-h-[100svh] content-center overflow-hidden">
      <HeroBackground webgl={fx.heroWebGL} paused={!active} />
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 pb-16 pt-8 sm:py-12 sm:pb-16 md:grid-cols-[1.15fr_1fr] md:gap-10">
        <div className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
          <HeroCopy animate={animate} />
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
