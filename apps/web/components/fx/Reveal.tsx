"use client";
import type { ReactNode } from "react";
import AnimatedContent from "@/components/bits/AnimatedContent";
import { useFx } from "@/lib/use-fx";

// A section or panel that slides in once when scrolled to. Until the page is ready (and always with reduced motion)
// it is simply there; same element tree either way, so the content never remounts.
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const fx = useFx();
  const still = !(fx.animate && fx.ready);
  return (
    <AnimatedContent
      className={className}
      distance={still ? 0 : 40}
      duration={still ? 0 : 0.7}
      initialOpacity={still ? 1 : 0}
      delay={still ? 0 : delay}
      threshold={0.15}
    >
      {children}
    </AnimatedContent>
  );
}
