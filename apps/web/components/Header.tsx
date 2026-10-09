"use client";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { isScrolled } from "@/lib/fx";
import { WalletButton } from "./WalletButton";

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};

// Transparent over the hero; frosted, with a smaller logo, once the page scrolls. Its height never changes with the
// scroll (no layout shift): the shrink is a transform. It publishes its height as --header-h for the hero.
export function Header() {
  const ref = useRef<HTMLElement>(null);
  const scrolled = useSyncExternalStore(subscribeScroll, () => isScrolled(window.scrollY), () => false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header
      ref={ref}
      className={`sticky top-0 z-40 w-full border-b transition-colors duration-300 motion-reduce:transition-none ${
        scrolled ? "border-line bg-night/70 backdrop-blur-md" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className={`origin-left font-display text-2xl tracking-wide sm:text-3xl text-pumpkin transition-transform duration-300 motion-reduce:transition-none ${scrolled ? "scale-[0.85]" : ""}`}
        >
          Spook<span className="text-ghost">Pad</span> <span aria-hidden className="hidden sm:inline">👻</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm sm:gap-4 sm:text-base">
          <Link href="/#graveyard" className="text-muted hover:text-ghost">Graveyard</Link>
          <Link href="/launch/" className="text-muted hover:text-ghost">Launch</Link>
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
