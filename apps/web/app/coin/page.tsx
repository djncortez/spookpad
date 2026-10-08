import type { Metadata } from "next";
import { Suspense } from "react";
import { CoinView } from "@/components/CoinView";

export const metadata: Metadata = { title: "Coin · SpookPad" };

// The mint comes from ?mint=…: a static export can't have a page per coin, so the page reads it in the browser.
export default function CoinPage() {
  return (
    <Suspense fallback={<p className="text-muted">Summoning the coin…</p>}>
      <CoinView />
    </Suspense>
  );
}
