"use client";
import { useEffect, useState } from "react";
import { fetchSettings } from "@/lib/public-data";
import { pumpUrl } from "@/lib/share";

// SpookPad's own token in the hero: the CA the admin set on the admin page, a copy button and a pump.fun link.
// The row keeps its height while loading (and when no CA is set) so the hero doesn't jump.
export function HeroCa() {
  const [ca, setCa] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => alive && setCa(s.site_ca)).catch(() => {}); // no CA shown
    return () => { alive = false; };
  }, []);

  const copy = () => {
    if (!ca) return;
    navigator.clipboard?.writeText(ca).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-center gap-2 md:justify-start">
      {ca && (
        <>
          <button
            type="button"
            onClick={copy}
            title="Copy the contract address"
            className="flex max-w-full items-center gap-2 rounded-full border-2 border-line bg-night/70 px-4 py-2 text-sm backdrop-blur transition-colors hover:border-pumpkin"
          >
            <span className="font-display text-pumpkin">CA</span>
            <span className="truncate font-mono text-ghost">{ca.slice(0, 6)}…{ca.slice(-6)}</span>
            <span className={copied ? "font-bold text-slime" : "font-bold text-muted"}>{copied ? "Copied!" : "Copy"}</span>
          </button>
          <a href={pumpUrl(ca)} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-muted underline hover:text-pumpkin">
            Buy on pump.fun
          </a>
        </>
      )}
    </div>
  );
}
