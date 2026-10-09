"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useFx } from "@/lib/use-fx";
import { FxBoundary } from "./FxBoundary";

// Loaded only when they will run: a phone never downloads three.js.
const GhostCursor = dynamic(() => import("../bits/GhostCursor"), { ssr: false });
const ClickSpark = dynamic(() => import("../bits/ClickSpark"), { ssr: false });

// Site-wide effects: orange sparks on clicks, and a faint ghost trail behind a mouse pointer (desktop only).
// Later layout changes (lists loaded, bands settled) move the reveal triggers; refresh them once the page stops
// resizing. Only on pages that have reveals, so gsap is never pulled into other pages.
function useScrollTriggerRefresh() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!document.querySelector(".reveal")) return;
        import("gsap/ScrollTrigger").then((m) => m.ScrollTrigger.refresh()).catch(() => {});
      }, 250);
    });
    ro.observe(document.body);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, []);
}

export function SiteFx() {
  const fx = useFx();
  const home = usePathname() === "/";
  useScrollTriggerRefresh();
  return (
    <>
      {fx.sparks && (
        <FxBoundary fallback={null}>
          <ClickSpark sparkColor="#ff7a1a" sparkSize={10} sparkRadius={20} sparkCount={8} duration={450} />
        </FxBoundary>
      )}
      {fx.ghostCursor && home && (
        // inline position: GhostCursor makes a parent without an inline position "relative", which would undo `fixed`
        <div aria-hidden className="pointer-events-none inset-0 z-50" style={{ position: "fixed" }}>
          <FxBoundary fallback={null}>
            <GhostCursor color="#b497cf" brightness={0.7} trailLength={36} bloomStrength={0.08} zIndex={50} />
          </FxBoundary>
        </div>
      )}
    </>
  );
}
