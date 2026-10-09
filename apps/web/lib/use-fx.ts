"use client";
// Browser facts for lib/fx.ts. Every hook returns its server value (no motion preference, no WebGL, not ready)
// during the static export and the first client render, then the real one: no hydration mismatches.
import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { fxPlan, webglAvailable, type FxPlan } from "./fx";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export const useReducedMotion = (): boolean => useMediaQuery("(prefers-reduced-motion: reduce)");
export const usePointerFine = (): boolean => useMediaQuery("(hover: hover) and (pointer: fine)");
export const useWide = (): boolean => useMediaQuery("(min-width: 640px)");

const never = () => () => {};
let webglCache: boolean | null = null; // checked once per page load
export function useWebGL(): boolean | null {
  return useSyncExternalStore(never, () => (webglCache ??= webglAvailable(() => document.createElement("canvas"))), () => null);
}

// True once the page has loaded and the browser is idle: heavy effects start after first paint, never before.
export function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idle = 0;
    let timer = 0;
    const go = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else timer = window.setTimeout(() => setReady(true), 300);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      window.removeEventListener("load", go);
      if (idle) window.cancelIdleCallback?.(idle);
      clearTimeout(timer);
    };
  }, []);
  return ready;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

// active: on (or near) the screen and the tab is visible, so animations may run. seen: has been near the screen once.
export function useVisibility(ref: RefObject<Element | null>, rootMargin = "200px"): { active: boolean; seen: boolean } {
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return { active: inView && !hidden, seen };
}

export function useFx(): FxPlan & { ready: boolean } {
  const reducedMotion = useReducedMotion();
  const pointerFine = usePointerFine();
  const wide = useWide();
  const webgl = useWebGL();
  const ready = useIdleReady();
  return { ...fxPlan({ reducedMotion, pointerFine, wide, webgl, ready }), ready };
}
