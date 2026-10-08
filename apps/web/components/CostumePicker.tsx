"use client";
import type { Costume } from "@/lib/public-data";

export function CostumePicker({ costumes, value, onChange, disabled }: {
  costumes: Costume[]; value: string; onChange(slug: string): void; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Costume" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {costumes.map((c) => (
        <button
          key={c.slug}
          type="button"
          role="radio"
          aria-checked={value === c.slug}
          disabled={disabled}
          onClick={() => onChange(c.slug)}
          className={`card flex flex-col items-center gap-1 px-3 py-4 transition ${value === c.slug ? "border-pumpkin shadow-[0_0_20px_#ff7a1a55]" : "hover:border-muted"}`}
        >
          <span aria-hidden className="text-4xl">{c.emoji}</span>
          <span className="text-sm font-semibold">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
