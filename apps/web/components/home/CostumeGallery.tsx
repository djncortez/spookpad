"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { GALLERY_ITEMS, SHOWCASE } from "@/lib/showcase";
import { useFx, useVisibility } from "@/lib/use-fx";

// A plain row of the costumes: the fallback (no WebGL, reduced motion) and what shows while the 3D gallery loads.
function StaticRack() {
  return (
    <ul tabIndex={0} aria-label="The seven costumes" className="flex h-full snap-x snap-mandatory items-center gap-4 overflow-x-auto px-4">
      {SHOWCASE.slice(1).map((c) => (
        <li key={c.slug} className="grid shrink-0 snap-center justify-items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.src} alt={`The mascot as a ${c.label}`} width={240} height={240} loading="lazy" className="h-60 w-60 rounded-3xl border border-line object-cover" />
          <span className="font-bold">{c.label}</span>
        </li>
      ))}
    </ul>
  );
}

const CircularGallery = dynamic(() => import("@/components/bits/CircularGallery"), { ssr: false });

// The 7 costumed mascots on a draggable 3D ring. Loads when first scrolled near; stops drawing off screen.
export function CostumeGallery() {
  const fx = useFx();
  const ref = useRef<HTMLDivElement>(null);
  const { active, seen } = useVisibility(ref, "300px");
  const [drawn, setDrawn] = useState(false);
  const font = fx.galleryWebGL ? `bold 30px ${getComputedStyle(document.body).fontFamily}` : "";
  return (
    <section className="grid gap-4">
      <SectionHeading>The costume wardrobe</SectionHeading>
      <p className="text-muted">Seven costumes, one mascot. Drag to spin the rack.</p>
      <div ref={ref} className="full-bleed relative h-[420px] sm:h-[520px]">
        {/* the static row stays underneath until the 3D ring has drawn its first full frame */}
        <div className={fx.galleryWebGL && drawn ? "invisible absolute inset-0" : "absolute inset-0"} aria-hidden={fx.galleryWebGL && drawn ? true : undefined}>
          <StaticRack />
        </div>
        {fx.galleryWebGL && seen && (
          <>
            <ul className="sr-only">
              {GALLERY_ITEMS.map((g) => <li key={g.text}>{g.text}</li>)}
            </ul>
            <div className="absolute inset-0">
              <FxBoundary fallback={null}>
                <CircularGallery items={GALLERY_ITEMS} bend={2} textColor="#f4f1ea" borderRadius={0.06} font={font} scrollSpeed={2} scrollEase={0.06} paused={!active} onReady={() => setDrawn(true)} />
              </FxBoundary>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
