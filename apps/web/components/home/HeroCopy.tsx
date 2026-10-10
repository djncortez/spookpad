"use client";
import Link from "next/link";
import SplitText from "@/components/bits/SplitText";
import { HeroCa } from "./HeroCa";

const TITLE = "Every coin wears a costume";
const TITLE_CLASS = "font-display text-5xl leading-[1.05] text-pumpkin sm:text-7xl";

// The hero's headline, subline and buttons: the same in today's hero and in the scroll intro.
export function HeroCopy({ animate }: { animate: boolean }) {
  return (
    <>
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
      <HeroCa />
    </>
  );
}
