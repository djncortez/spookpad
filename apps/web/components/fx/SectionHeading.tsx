"use client";
import ScrollFloat from "@/components/bits/ScrollFloat";
import { useFx } from "@/lib/use-fx";

const TEXT = "font-display text-4xl sm:text-5xl";

// A section heading whose letters float up while it scrolls into view; a plain heading with reduced motion
// (and until the page is ready, so the server/hydration render never animates).
export function SectionHeading({ children, className = "" }: { children: string; className?: string }) {
  const fx = useFx();
  if (!(fx.animate && fx.ready)) return <h2 className={`${TEXT} ${className}`}>{children}</h2>;
  return (
    <ScrollFloat containerClassName={className} textClassName={TEXT} scrollStart="top bottom" scrollEnd="bottom bottom-=15%" stagger={0.03}>
      {children}
    </ScrollFloat>
  );
}
