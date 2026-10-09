"use client";
import dynamic from "next/dynamic";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { cappedDpr } from "@/lib/fx";

const DarkVeil = dynamic(() => import("@/components/bits/DarkVeil"), { ssr: false });
const Particles = dynamic(() => import("@/components/bits/Particles"), { ssr: false });

// The hero's purple fog and drifting embers. The CSS gradient (.hero-gradient) is always there; the WebGL layers go
// on top only when allowed (wide screen, WebGL, motion, page ready), and fall back to nothing if they throw.
export function HeroBackground({ webgl, paused }: { webgl: boolean; paused: boolean }) {
  return (
    <div aria-hidden className="hero-gradient absolute inset-0 -z-10">
      {webgl && (
        <FxBoundary fallback={null}>
          <div className="absolute inset-0 opacity-70">
            <DarkVeil speed={0.35} noiseIntensity={0.03} warpAmount={0.4} paused={paused} />
          </div>
          <div className="absolute inset-0">
            <Particles
              particleCount={120}
              particleSpread={10}
              speed={0.08}
              particleColors={["#ff7a1a", "#ffb347", "#ff4d6d"]}
              particleBaseSize={80}
              alphaParticles
              pixelRatio={cappedDpr(window.devicePixelRatio)}
              paused={paused}
            />
          </div>
        </FxBoundary>
      )}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night to-transparent" />
    </div>
  );
}
