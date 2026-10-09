# SpookPad visual redesign

Date: 2026-10-09. Status: approved in conversation.

## Goal

Make SpookPad eye-catching and interactive, especially the opening hero and scroll animations, without touching any
wallet, payment or launch logic. Traders should understand what SpookPad does within a few seconds of landing.

## Approach

Copy chosen components from React Bits (reactbits.dev, MIT + Commons Clause, free for commercial use) in their
TypeScript + Tailwind variant into `apps/web/components/bits/`, one file per component, keeping an attribution comment.
Restyle with SpookPad's existing tokens (night `#0d0a14`, night-2, line, ghost `#f4f1ea`, muted, pumpkin `#ff7a1a`,
blood, slime; Creepster display font, Space Grotesk body).

New dependencies (apps/web only): `gsap` and `@gsap/react`, `motion`, `ogl`, `lenis`, `three` (GhostCursor only).

| Component | Used for | Needs |
|---|---|---|
| PixelTransition (or HalftoneReveal) | hero costume transformation | gsap (ogl) |
| DarkVeil | hero fog background | ogl |
| Particles | drifting embers in the hero | ogl |
| SplitText | hero headline reveal | gsap, @gsap/react |
| CountUp | stats counters | motion |
| ScrollVelocity | newest-coin ticker | motion |
| ScrollStack | "How it works" stacked cards | lenis |
| ScrollFloat | section headings | gsap ScrollTrigger |
| CircularGallery | 3D costume gallery | ogl |
| TiltedCard, SpotlightCard | Graveyard coin cards, Launch costume picker | motion / none |
| AnimatedContent | fade/slide-in of sections and Launch page panels | gsap ScrollTrigger |
| GhostCursor | ghost trail following the mouse | three |
| ClickSpark | orange sparks on click | none |

## Performance and accessibility rules

- WebGL/canvas components (DarkVeil, Particles, CircularGallery, HalftoneReveal, GhostCursor) load with
  `next/dynamic` and `ssr: false` after first paint; the page is complete and readable without them.
- `prefers-reduced-motion: reduce` puts every animation in its final still state: the hero shows one costumed
  mascot, counters show final numbers, no cursor trail, no sparks, no smooth scrolling.
- Touch devices (`pointer: coarse`): no GhostCursor. Below 640 px the heavy backgrounds fall back to a CSS gradient;
  elsewhere WebGL device pixel ratio is capped at 1.5.
- If WebGL is unavailable, components render a static fallback (CSS gradient or plain image), never a blank area.
- Text stays real text; decorative layers are `aria-hidden`.
- No layout shift: fixed-size containers for the hero image and the gallery.
- Animations pause when the tab is hidden.

## Mascot artwork

One original SpookPad mascot (cute, simple, bare, reads well in every costume), generated once with OpenRouter's image
model, then dressed in all 7 costumes with SpookPad's own costume prompt (`buildPrompt`, `packages/core/src/costumes.ts`)
and the production model. About $0.25 of OpenRouter credit. A one-off script `scripts/make-showcase-art.mjs` writes
`apps/web/public/showcase/{plain,ghost,witch,vampire,pumpkin,mummy,skeleton,devil}.webp` (square, at most 200 KB each),
which are committed; nothing is generated at page load. The owner approves the images before they ship; one costume can
be regenerated alone.

## Home page (top to bottom)

1. **Hero** (full viewport height): the mascot transforms through the costumes every ~3 s (plain, ghost, witch,
   vampire, pumpkin, mummy, skeleton, devil, loop) with a pixel/halftone dissolve and the costume name under it.
   Background: DarkVeil purple fog with Particles embers. Headline "Every coin wears a costume" (Creepster) revealed
   with SplitText, a subline, buttons **Launch a coin** (primary) and **See the Graveyard** (scrolls to it), and a
   scroll hint.
2. **Stats and ticker**: CountUp counters for coins launched, costumes summoned and costumes available (7). Below, a
   ScrollVelocity ticker of the newest coin names and tickers (hidden when there are no coins).
3. **How it works**: ScrollStack of three cards: upload your mascot; pick a costume (AI dresses it, costume fee from
   public settings); launch on pump.fun from your own wallet (creator fees are yours). Fees are read from the public
   settings view, never hard-coded.
4. **Costume gallery**: CircularGallery of the 7 costumed mascots, draggable, labelled with emoji and name.
5. **Graveyard**: data and live market caps unchanged; each coin card becomes a TiltedCard with a SpotlightCard
   pumpkin glow; hovering (tapping on touch) shows the original image.

Section headings use ScrollFloat; sections enter with AnimatedContent.

## Site-wide

- GhostCursor faint ghost trail on desktop only.
- ClickSpark orange sparks on clicks.
- Header transparent over the hero, frosted (backdrop blur) and slightly smaller once scrolled.
- Footer gains the mascot.

## Launch page

- Costume picker as SpotlightCard tiles that lift on hover; the selected one glows pumpkin.
- Panels enter with AnimatedContent.
- While the AI works: a bubbling cauldron animation (CSS/SVG, no new dependency) with rotating spooky status lines;
  the finished costume dissolves in.
- RevealSlider restyled.
- No change to any logic, props or calls in LaunchWizard, summon, launch-coin, pending or fee-tx.

## Data

Stats need public counts. Add a read-only view `v_stats` (coins launched, costumes summoned; counts only, no wallets)
granted to anon, in a new migration `supabase/migrations/0002_stats.sql` ending with the lock-down rules. This is the
only backend change.

## Testing and verification

- Existing suite, typecheck, lint and web build pass.
- Unit tests for new pure logic: costume cycle order and timing, stats formatting, reduced-motion helper, ticker list.
- SQL test for `v_stats`: anon reads the counts; no wallet columns exist.
- Manual check in a real browser at desktop and 375 px width, with reduce-motion on and with WebGL disabled.
- Lighthouse mobile performance on the home page at least 70.

## Out of scope

Costumes, fees, payments, launches, the admin page, the market-cap engine, and any copy beyond the new sections.
