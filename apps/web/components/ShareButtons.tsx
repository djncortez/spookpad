"use client";
import { useEffect, useState } from "react";
import { artUrl } from "@/lib/art";
import type { GraveCoin } from "@/lib/graveyard";
import { coinPageUrl, pumpUrl, shareText, xIntentUrl } from "@/lib/share";
import { drawShareCard } from "@/lib/share-card";

// Share on X everywhere; in the launch party (full) also the card download and copy link (spec
// 2026-10-09-spookpad-podium-party-design.md). On a phone that can share files, Share on X opens the share sheet with
// the card attached instead of the X web page.
export function ShareButtons({ coin, costume, full = false }: { coin: GraveCoin; costume: string | undefined; full?: boolean }) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const art = artUrl(coin.result_path);
    if (!full || !art) return;
    let alive = true;
    let url = "";
    drawShareCard({ name: coin.name, ticker: coin.ticker, costume, art })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      })
      .catch(() => {}); // no card: Download stays hidden and Share on X uses the X page
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [full, coin, costume]);

  const text = shareText(coin, costume);
  const link = pumpUrl(coin.mint);
  const fileName = `${coin.ticker}-spookpad.png`;

  const share = async () => {
    const file = card ? new File([card.blob], fileName, { type: "image/png" }) : null;
    if (file && window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text, url: link });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // the trader closed the share sheet
      }
    }
    window.open(xIntentUrl(text, link), "_blank", "noopener,noreferrer");
  };

  const copy = () => {
    void navigator.clipboard.writeText(coinPageUrl(window.location.origin, coin.mint)).then(() => setCopied(true));
  };

  return (
    <div className={full ? "flex flex-wrap justify-center gap-3" : "contents"}>
      <button type="button" className={full ? "btn" : "btn btn-ghost"} onClick={() => void share()}>Share on X</button>
      {full && card && <a className="btn btn-ghost" href={card.url} download={fileName}>Download card</a>}
      {full && <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>}
    </div>
  );
}
