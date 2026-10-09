# SpookPad scroll intro: the wardrobe stage

Date: 2026-10-09. Status: approved in conversation. Builds on `2026-10-09-spookpad-redesign-design.md`.

## Goal

When a trader lands on the home page, scrolling plays a short 3D scene: the SpookPad mascot stands on a stage, its
seven costumes turn around it on a wardrobe ring, it picks one and hops into it. The scene says "pick a costume for
your coin" without words, then hands over to the rest of the page.

Real 3D models were tried first (TRELLIS.2): the shapes were good but the textures were blotchy and the free GPU
allowance covers about two models a day. The owner chose this version instead: a 3D stage built from the existing 2D
art. No paid service, no new runtime dependency.

## Assets: cut-outs

The eight showcase pictures (`apps/web/public/showcase/{plain,ghost,witch,vampire,pumpkin,mummy,skeleton,devil}.webp`)
sit on a solid dark purple background. A one-off script `scripts/make-cutouts.mjs` (sharp, already installed)
flood-fills that background from the image edges to transparent and writes
`apps/web/public/showcase/cut/<slug>.webp`: 512 x 512, transparent background, at most 120 KB each, committed. The
flood fill is a pure function in `scripts/cutout-lib.mjs` (pixels in, alpha mask out), so it is unit tested.
A colour within distance 20 of the corner colour counts as background. Pixels inside the character never become
transparent, even when they match the background colour, because the fill only spreads from the edges. The owner
approves the eight cut-outs before they ship.

## The scene

A three.js scene (three is already a dependency) in a new component, loaded with `next/dynamic` and `ssr: false`:

- **Background:** the hero's purple fog and embers (`HeroBackground`, unchanged) behind a transparent canvas.
- **Floor:** a dark disc with a soft pumpkin glow under the mascot.
- **Sticker look:** each character is a stack of 6 planes, about 1.5% of its height apart in depth. The front plane
  shows the cut-out; the 5 behind it show the same shape in a dark purple, so the edge reads as a thick sticker. A thin
  pumpkin rim, the cut-out's shape scaled up 3%, sits behind the stack. A soft round shadow sits on the floor under
  each character. The characters face the camera (they turn only around the vertical axis).
- **The wardrobe ring:** the seven costumed characters at 55% of the mascot's size, evenly spaced on a circle around
  and behind it.

## The scroll story

The intro section is 350 svh tall with a sticky, full-screen stage inside it (CSS `position: sticky`; no GSAP pin).
Scroll progress `p` (0 at the section's top, 1 when its bottom reaches the bottom of the screen) drives everything
through one pure function in `apps/web/lib/intro.ts`: `introFrame(p, pick)` returns the camera distance, ring rise,
ring angle, mascot turn and lean, hop height, squash, smoke amount, which picture the mascot wears, and the opacity of
the text overlays. Scrolling up runs the same function backwards, so the scene reverses exactly. `pick` (0 to 6) is
chosen at random once per page visit.

| p | What happens |
|---|---|
| 0 to 0.15 | The opening text (headline, subline, buttons: the same as today's hero) is visible and fades out. The camera glides in. |
| 0.15 to 0.30 | The seven costumes rise up from the floor onto the ring. |
| 0.30 to 0.70 | The ring turns one and a half times as you scroll and ends with `pick` in front. The mascot turns (up to 25 degrees) and leans toward whichever costume is in front, and bobs gently. |
| 0.70 to 0.85 | The mascot hops. At the top of the hop an orange smoke puff (about 40 sprites) hides it; the mascot's picture switches from plain to `pick`; the picked costume leaves the ring; the mascot lands with a squash and bounce. |
| 0.85 to 1 | The headline "Every coin wears a costume" and the Launch a coin / See the Graveyard buttons fade in over the stage, with the costume's name under the mascot. |

A small "Skip intro" link at the bottom of the stage jumps to `#stats`. Scrolling past the section continues into the
stats, How it works, the gallery and the Graveyard, all unchanged.

Between scroll events, a gentle idle bob keeps the mascot alive. The canvas stops drawing when the section is off
screen or the tab is hidden.

## When the intro runs

A new flag `intro3d` in `fxPlan` (`apps/web/lib/fx.ts`): motion allowed, page ready, and WebGL available. Unlike the
hero background, phones get it too: on screens under 640 px the device pixel ratio is 1 and the smoke uses 20 sprites.

- **Server render, first paint, and whenever `intro3d` is false** (reduced motion, no WebGL, script failure): today's
  hero, exactly as it is now: 100 svh, the CostumeMorph picture cycle and no pinning.
- **When `intro3d` turns true,** the section grows to 350 svh and the stage takes over. The page then refreshes
  ScrollTrigger (SiteFx already does this whenever the page height changes), so the reveals further down measure
  their new positions. The stage cross-fades in only after
  the plain cut-out and the floor are loaded. Until then today's hero stays visible.
- If the scene throws, `FxBoundary` falls back to today's hero.

## Performance and accessibility

- three.js stays out of the home page's initial JavaScript. `scripts/check-initial-js.mjs` must still pass.
- The cut-outs load after first paint: the plain one first, then the rest.
- Lighthouse mobile performance on the home page stays at 70 or more.
- The canvas is `aria-hidden`. The headline stays real text in the page, and the costume name is announced politely
  when the pick lands.
- No horizontal overflow at 375 px. The stage never hides the header.

## Testing

- **Unit tests for `introFrame`:**
  - text is fully visible at p = 0 and hidden from 0.15 to 0.85;
  - the ring ends with `pick` in front at 0.70;
  - the mascot wears plain before the swap point and `pick` after it;
  - every numeric value is continuous (no jumps larger than a small bound between close values of p); only the
    picture switches at once, while the smoke covers the mascot fully;
  - p is clamped outside 0 to 1.
- **Unit tests:** the cut-out mask on a small synthetic image (edge background removed, a same-coloured pixel inside
  the shape kept), and the new `fxPlan.intro3d` rules.
- **Existing checks:** the suite, typecheck, lint, web build and `check-initial-js.mjs` pass.
- **Manual browser check:** desktop and 375 px; scrolling forward and back; reduced motion (today's hero, no tall
  section); WebGL disabled (today's hero).

## Out of scope

Real 3D models; any change to the other home sections, the Launch page, wallet, payments or launches; new
dependencies.
