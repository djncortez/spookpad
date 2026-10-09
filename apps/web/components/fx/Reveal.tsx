"use client";
import type { ReactNode } from "react";
import AnimatedContent from "@/components/bits/AnimatedContent";

// A section or panel that slides in once when scrolled to. The animation props are constant (so nothing re-runs when
// the page becomes ready); reduced motion is handled in CSS (.reveal in globals.css keeps it visible and still).
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <AnimatedContent className={`reveal ${className}`} distance={40} duration={0.7} initialOpacity={0} delay={delay} threshold={0.15}>
      {children}
    </AnimatedContent>
  );
}
