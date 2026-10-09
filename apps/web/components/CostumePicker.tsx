"use client";
import type { Costume } from "@/lib/public-data";
import { SHOWCASE } from "@/lib/showcase";
import SpotlightCard from "./bits/SpotlightCard";

// the mascot wearing each costume (costumes added later in admin have no picture and show their name only)
const art = (slug: string) => SHOWCASE.find((s) => s.slug === slug)?.src;

// Same props and radio behaviour as before; each costume is a SpotlightCard tile that lifts on hover, and the
// selected one glows pumpkin.
export function CostumePicker({ costumes, value, onChange, disabled }: {
  costumes: Costume[]; value: string; onChange(slug: string): void; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Costume" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {costumes.map((c) => {
        const on = value === c.slug;
        return (
          <SpotlightCard
            key={c.slug}
            spotlightColor="#ff7a1a"
            intensity={on ? 0.3 : 0.18}
            borderGlow={1}
            proximity={40}
            ambient={on}
            className={`rounded-[1.25rem] transition-transform duration-200 ${disabled ? "" : "motion-safe:hover:-translate-y-1"} ${
              on ? "outline-2 outline-pumpkin drop-shadow-[0_0_14px_#ff7a1a88]" : ""
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(c.slug)}
              className="flex w-full flex-col items-center gap-2 px-3 py-4 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ghost disabled:opacity-60"
            >
              {art(c.slug) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art(c.slug)} alt="" aria-hidden width={96} height={96} loading="lazy" className="h-20 w-20 rounded-2xl object-cover" />
              )}
              <span className="text-sm font-semibold">{c.label}</span>
            </button>
          </SpotlightCard>
        );
      })}
    </div>
  );
}
