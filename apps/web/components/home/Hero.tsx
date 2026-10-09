"use client";
import { IntroStage } from "./IntroStage";

// The opening: the scroll intro. It is also today's hero whenever the 3D scene does not run (server render, first
// paint, reduced motion, no WebGL, or the scene failing): see IntroStage.
export function Hero() {
  return <IntroStage />;
}
