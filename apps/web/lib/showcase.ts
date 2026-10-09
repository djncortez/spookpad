// The home page's mascot art (redesign spec "Mascot artwork"): public/showcase/<slug>.webp, made once by
// scripts/make-showcase-art.mjs. Labels come from the seed costumes the art was made with.
import { SEED_COSTUMES } from "@spookpad/core/costumes";

export interface ShowcaseItem { slug: string; label: string; emoji: string; src: string }

const item = (slug: string, label: string, emoji: string): ShowcaseItem => ({ slug, label, emoji, src: `/showcase/${slug}.webp` });

// hero order: plain, ghost, witch, vampire, pumpkin, mummy, skeleton, devil, then around again
export const SHOWCASE: ShowcaseItem[] = [
  item("plain", "No costume", "✨"),
  ...SEED_COSTUMES.map((c) => item(c.slug, c.label, c.emoji)),
];
export const CYCLE_MS = 3000; // one costume every 3 s
export const STILL_INDEX = 1;  // reduced motion: the hero shows the ghost costume, still

// The gallery's 7 costumes (no plain). A module constant, so the WebGL gallery is never rebuilt by a re-render.
export const GALLERY_ITEMS: { image: string; text: string }[] = SHOWCASE.slice(1).map((c) => ({ image: c.src, text: `${c.emoji} ${c.label}` }));

// The animated cycle starts on the costume the still image shows, so motion starting changes nothing on screen.
export const heroIndex = (i: number, count: number = SHOWCASE.length): number => (i + STILL_INDEX) % count;

export interface HeroFrame { current: number; slotA: number; slotB: number; showB: boolean }

// The hero swaps between two slots with a pixel dissolve: on step s the slot being revealed shows costume s and the
// slot being hidden keeps costume s-1, so nothing changes under the pixels while they cover it.
export function heroFrame(step: number, count: number): HeroFrame {
  const s = Math.max(0, Math.floor(step));
  const current = s % count;
  const previous = (s - 1 + count) % count;
  const showB = s % 2 === 1;
  return { current, slotA: showB ? previous : current, slotB: showB ? current : previous, showB };
}
