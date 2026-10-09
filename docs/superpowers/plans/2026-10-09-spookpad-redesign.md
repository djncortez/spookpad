# SpookPad Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SpookPad's home page and Launch page eye-catching and interactive (costume-cycling hero, stats, scroll animations, 3D costume gallery, tilting Graveyard cards, site-wide sparks and ghost cursor) without changing any wallet, payment or launch logic.

**Architecture:** Chosen React Bits components are copied (pinned to one upstream commit) into `apps/web/components/bits/`, with small marked edits for SSR safety, pausing and SpookPad tokens. Pure, unit-tested helpers in `apps/web/lib/` decide which effects may run (`fxPlan`) and hold the data logic (costume cycle, counter formatting, ticker line, fee text, brew lines); thin hooks in `lib/use-fx.ts` feed them browser facts. WebGL components load with `next/dynamic({ ssr: false })` only when allowed and fall back to CSS or plain images. The only backend change is a read-only `v_stats` view.

**Tech Stack:** Next.js 16.3.8 static export (Turbopack), React 19.2.8, Tailwind 4, TypeScript 5, Vitest 5, embedded-postgres SQL tests; new: gsap 3.15 + @gsap/react 2.1 (SplitText, ScrollTrigger), motion 12.43, ogl 1.0.11, three 0.180 (+ @types/three), sharp 0.35 (root devDependency, art script only).

**Spec:** `docs/superpowers/specs/2026-10-09-spookpad-redesign-design.md` (approved; follow it exactly).

## Global Constraints

Binding rules from the spec (every task includes these):

- WebGL/canvas components (DarkVeil, Particles, CircularGallery, GhostCursor) load with `next/dynamic` and `ssr: false` after first paint; the page is complete and readable without them.
- `prefers-reduced-motion: reduce` puts every animation in its final still state: the hero shows one costumed mascot, counters show final numbers, no cursor trail, no sparks, no smooth scrolling.
- Touch devices (`pointer: coarse`): no GhostCursor. Below 640 px the heavy backgrounds fall back to a CSS gradient; elsewhere WebGL device pixel ratio is capped at 1.5.
- If WebGL is unavailable, components render a static fallback (CSS gradient or plain image), never a blank area.
- Text stays real text; decorative layers are `aria-hidden`.
- No layout shift: fixed-size containers for the hero image and the gallery.
- Animations pause when the tab is hidden.
- No change to any logic, props or calls in LaunchWizard, summon, launch-coin, pending or fee-tx. (`apps/web/lib/summon.ts`, `launch-coin.ts`, `pending.ts`, `fee-tx.ts` are not touched at all; LaunchWizard only gains wrapper tags and one decorative element, Task 10.)
- Restyle with SpookPad's tokens only: night `#0d0a14`, night-2 `#171124`, line `#2c2340`, ghost `#f4f1ea`, muted `#a79fb8`, pumpkin `#ff7a1a`, blood `#ff4d6d`, slime `#9be15d`; Creepster display font (`font-display`), Space Grotesk body.
- Fees are read from the public settings view (`fetchSettings()`), never hard-coded.
- Lighthouse mobile performance on the home page is at least 70.
- The only backend change is `supabase/migrations/0002_stats.sql` (view `v_stats`, counts only, ending with the lock-down rules). Out of scope: costumes, fees, payments, launches, the admin page, the market-cap engine, copy beyond the new sections.

Project rules:

- Work on branch `redesign`. **Never push to `master`** (Netlify deploys the live site from `master`). Never run `git push` at all unless the controller says so, and then only `git push -u origin redesign`.
- Every commit message ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Every file in `apps/web/components/bits/` keeps the React Bits attribution comment (component name, MIT + Commons Clause, pinned source URL, list of SpookPad changes) right under `'use client';`.
- React Bits sources are pinned to commit `b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3` of `DavidHDev/react-bits`. Download with the exact URLs given; never `main`.
- The static export must keep working: `npm run build` (repo root) succeeds and writes `apps/web/out/`.
- Component visuals are verified manually in a browser (Task 11), not with unit tests. Unit tests cover the pure helpers only.
- Shell: Git Bash on Windows, run every command from the repo root `C:\Users\User\Desktop\halloween coin` unless a step says otherwise. Working-tree files use CRLF line endings (git `core.autocrlf=true`); downloaded files arrive with LF. Both are fine.
- `apps/web/CLAUDE.md` / `apps/web/AGENTS.md` (untracked, written by `next dev`) are not part of this work: never `git add -A`; add the files each step names.
- Before writing Next.js code, heed `apps/web/AGENTS.md`: this Next.js version may differ from what you know; the relevant guide is `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (`next/dynamic` with `ssr: false` is only allowed in Client Components — every file using it here starts with `"use client"`).

## Decisions made while planning (spec ambiguities)

- **PixelTransition, not HalftoneReveal**, for the hero dissolve: it is DOM + gsap (no WebGL), so it also works on phones and without WebGL. It gains a controlled `active` prop; the hero alternates two image slots (`heroFrame`, Task 5).
- **ScrollStack uses window scrolling without Lenis.** Upstream's `useWindowScroll` mode starts a page-wide Lenis smooth scroller (scroll hijacking, conflicts with GSAP ScrollTrigger, anchor links and "no smooth scrolling" under reduced motion). The copy listens to native scroll events instead, so **`lenis` is not installed** (the spec lists it only as ScrollStack's need). Reduced motion renders a plain list instead of the stack.
- **"Slightly smaller" header** is a transform on the logo (scale 0.85) plus a frosted bar; the header's height never changes with scroll (the spec's no-layout-shift rule).
- **Costumes summoned** = generations with a finished costume image (`result_path is not null`); **coins launched** = live launches. **Costumes available** is the length of the existing `v_costumes` list (no new column).
- **Touch Graveyard cards:** tapping the picture toggles the original image; the name/market-cap row is the link to the coin page. Mouse: hovering the card shows the original; the whole card is the link.
- **Cauldron** shows in a generating GenerationCard and, decoratively, in LaunchWizard's existing status bar while its existing status is the brewing text (no new state or logic).
- **Gallery on phones** keeps WebGL (it is not a background) with the 1.5 DPR cap; it only mounts when scrolled near, so it does not affect the Lighthouse load.

## File Structure

```
apps/web/
  components/bits/            React Bits copies (one file each, attribution header, marked SpookPad edits)
    PixelTransition.tsx  DarkVeil.tsx  Particles.tsx  SplitText.tsx  CountUp.tsx  ScrollVelocity.tsx
    ScrollStack.tsx  ScrollFloat.tsx  CircularGallery.tsx  TiltedCard.tsx  SpotlightCard.tsx
    AnimatedContent.tsx  GhostCursor.tsx  ClickSpark.tsx
  components/fx/
    FxBoundary.tsx            error boundary: a throwing effect shows its fallback
    SiteFx.tsx                ClickSpark + GhostCursor (dynamic), decided by useFx()
    Reveal.tsx                AnimatedContent wrapper (still with reduced motion)
    SectionHeading.tsx        ScrollFloat heading (plain h2 with reduced motion)
  components/home/
    Hero.tsx  HeroBackground.tsx  CostumeMorph.tsx  StatsTicker.tsx  HowItWorks.tsx  CostumeGallery.tsx
  components/Cauldron.tsx     SVG/CSS cauldron + rotating brew lines
  components/ (modified)      Header, Footer, CoinCard, Graveyard, CostumePicker, GenerationCard, RevealSlider, LaunchWizard (wrappers only)
  lib/fx.ts                   pure: fxPlan, cappedDpr, isScrolled, webglAvailable
  lib/use-fx.ts               hooks: useMediaQuery, useReducedMotion, usePointerFine, useWide, useWebGL, useIdleReady, useVisibility, useFx
  lib/showcase.ts             pure: SHOWCASE, CYCLE_MS, STILL_INDEX, GALLERY_ITEMS, heroFrame
  lib/stats.ts                pure: compactCount, formatCount, tickerLine
  lib/how-it-works.ts         pure: howItWorksSteps
  lib/brew.ts                 pure: BREW_LINES, BREW_EVERY_MS, brewLine
  lib/public-data.ts          + Stats, fetchStats
  app/page.tsx, app/layout.tsx, app/globals.css (modified)
  public/showcase/{plain,ghost,witch,vampire,pumpkin,mummy,skeleton,devil}.webp   (Task 2, committed)
  scripts/check-initial-js.mjs   bundle check: no three/ogl in the home page's initial JS
  test/fx.test.ts  showcase.test.ts  stats.test.ts  how-it-works.test.ts  brew.test.ts
  eslint.config.mjs (ignore components/bits/**), package.json (deps)
scripts/make-showcase-art.mjs      one-off art generator (npm run showcase-art)
scripts/showcase-art-lib.mjs       its testable parts
scripts/test/showcase-art.test.ts
supabase/migrations/0002_stats.sql
supabase/tests/stats.test.ts
package.json (root: sharp devDependency, showcase-art script)
```

---

### Task 1: Branch, dependencies and the effect helpers

**Files:**
- Create: `apps/web/lib/fx.ts`, `apps/web/lib/use-fx.ts`, `apps/web/components/fx/FxBoundary.tsx`, `apps/web/test/fx.test.ts`, folder `apps/web/components/bits/`
- Modify: `apps/web/package.json`, `package.json`, `package-lock.json` (via npm), `apps/web/eslint.config.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `lib/fx.ts`: `MAX_DPR = 1.5`; `SCROLLED_AT = 24`; `interface FxEnv { reducedMotion: boolean; pointerFine: boolean; wide: boolean; webgl: boolean | null; ready: boolean }`; `interface FxPlan { animate: boolean; heroWebGL: boolean; galleryWebGL: boolean; ghostCursor: boolean; sparks: boolean }`; `fxPlan(e: FxEnv): FxPlan`; `cappedDpr(dpr: number | undefined): number`; `isScrolled(y: number): boolean`; `interface CanvasLike { getContext(id: string): unknown }`; `webglAvailable(makeCanvas: () => CanvasLike | null): boolean`.
  - `lib/use-fx.ts` (client): `useMediaQuery(query: string): boolean`; `useReducedMotion(): boolean`; `usePointerFine(): boolean`; `useWide(): boolean` (≥ 640 px); `useWebGL(): boolean | null`; `useIdleReady(): boolean`; `useVisibility(ref: RefObject<Element | null>, rootMargin?: string): { active: boolean; seen: boolean }` (active = near the viewport and tab visible); `useFx(): FxPlan`.
  - `components/fx/FxBoundary.tsx`: `class FxBoundary` with props `{ fallback: ReactNode; children: ReactNode }`.
  - Installed: `gsap`, `@gsap/react`, `motion`, `ogl`, `three` (apps/web deps), `@types/three` (apps/web devDep), `sharp` (root devDep). ESLint ignores `components/bits/**`.

- [ ] **Step 1: Create the branch**

```bash
git switch master
git status --short          # expect only "?? apps/web/AGENTS.md" and "?? apps/web/CLAUDE.md" (leave them alone)
git switch -c redesign
git branch --show-current   # expect: redesign
```

- [ ] **Step 2: Install the dependencies**

```bash
npm install -w apps/web --no-audit --no-fund gsap@^3.15.0 @gsap/react@^2.1.2 motion@^12.43.0 ogl@^1.0.11 three@^0.180.0
npm install -w apps/web -D --no-audit --no-fund @types/three@^0.180.0
npm install -D --no-audit --no-fund sharp@^0.35.5
```

Expected: `apps/web/package.json` gains `"@gsap/react": "^2.1.2"`, `"gsap": "^3.15.0"`, `"motion": "^12.43.0"`, `"ogl": "^1.0.11"`, `"three": "^0.180.0"` under dependencies and `"@types/three": "^0.180.0"` under devDependencies; the root `package.json` gains `"sharp": "^0.35.5"` under devDependencies. (Use motion 12, not 14: the React Bits copies were written against 12. `sharp` is already in node_modules through Next; this makes the art script's use of it explicit.)

- [ ] **Step 3: Let ESLint skip the React Bits copies**

In `apps/web/eslint.config.mjs` replace

````js
    "next-env.d.ts",
  ]),
````

with

````js
    "next-env.d.ts",
    // React Bits components copied as-is (with marked SpookPad edits): typechecked, not linted.
    "components/bits/**",
  ]),
````

Then create the folder: `mkdir -p apps/web/components/bits apps/web/components/fx apps/web/components/home`

- [ ] **Step 4: Write the failing test** — `apps/web/test/fx.test.ts`:

````ts
import { describe, expect, test } from "vitest";
import { cappedDpr, fxPlan, isScrolled, webglAvailable, type FxEnv } from "../lib/fx";

const desktop: FxEnv = { reducedMotion: false, pointerFine: true, wide: true, webgl: true, ready: true };

describe("fxPlan", () => {
  test("a capable desktop gets every effect", () => {
    expect(fxPlan(desktop)).toEqual({ animate: true, heroWebGL: true, galleryWebGL: true, ghostCursor: true, sparks: true });
  });
  test("reduced motion turns everything off", () => {
    expect(fxPlan({ ...desktop, reducedMotion: true })).toEqual({
      animate: false, heroWebGL: false, galleryWebGL: false, ghostCursor: false, sparks: false,
    });
  });
  test("touch devices get no ghost cursor", () => {
    expect(fxPlan({ ...desktop, pointerFine: false })).toMatchObject({ ghostCursor: false, heroWebGL: true, sparks: true });
  });
  test("below 640 px the hero background is the CSS gradient and there is no ghost cursor; the gallery stays", () => {
    expect(fxPlan({ ...desktop, wide: false })).toMatchObject({ heroWebGL: false, ghostCursor: false, galleryWebGL: true });
  });
  test("no WebGL (or not checked yet) means static fallbacks, still animated", () => {
    for (const webgl of [false, null]) {
      expect(fxPlan({ ...desktop, webgl })).toEqual({ animate: true, heroWebGL: false, galleryWebGL: false, ghostCursor: false, sparks: true });
    }
  });
  test("nothing heavy loads before the page is ready", () => {
    expect(fxPlan({ ...desktop, ready: false })).toEqual({ animate: true, heroWebGL: false, galleryWebGL: false, ghostCursor: false, sparks: false });
  });
});

test("device pixel ratio is capped at 1.5", () => {
  expect(cappedDpr(3)).toBe(1.5);
  expect(cappedDpr(1.25)).toBe(1.25);
  expect(cappedDpr(undefined)).toBe(1);
  expect(cappedDpr(0)).toBe(1);
});

test("the header counts as scrolled after 24 px", () => {
  expect(isScrolled(0)).toBe(false);
  expect(isScrolled(24)).toBe(false);
  expect(isScrolled(25)).toBe(true);
});

describe("webglAvailable", () => {
  const canvas = (ok: string[]) => ({ getContext: (id: string) => (ok.includes(id) ? { getExtension: () => ({ loseContext() {} }) } : null) });
  test("WebGL 2 or 1 counts", () => {
    expect(webglAvailable(() => canvas(["webgl2"]))).toBe(true);
    expect(webglAvailable(() => canvas(["webgl"]))).toBe(true);
  });
  test("no context, no canvas or a throwing browser means no WebGL", () => {
    expect(webglAvailable(() => canvas([]))).toBe(false);
    expect(webglAvailable(() => null)).toBe(false);
    expect(webglAvailable(() => { throw new Error("blocked"); })).toBe(false);
  });
  test("the test context is released", () => {
    let lost = false;
    webglAvailable(() => ({ getContext: () => ({ getExtension: () => ({ loseContext: () => { lost = true; } }) }) }));
    expect(lost).toBe(true);
  });
});
````

- [ ] **Step 5: Run it to see it fail**

Run: `npx vitest run apps/web/test/fx.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/fx"`.

- [ ] **Step 6: Implement** `apps/web/lib/fx.ts`:

````ts
// Which visual effects may run (redesign spec "Performance and accessibility rules"). Pure: the hooks in use-fx.ts
// feed it what the browser reports.
export const MAX_DPR = 1.5; // WebGL device pixel ratio cap
export const SCROLLED_AT = 24; // px scrolled before the header turns frosted

export interface FxEnv {
  reducedMotion: boolean; // prefers-reduced-motion: reduce
  pointerFine: boolean;   // a mouse or trackpad (hover: hover and pointer: fine)
  wide: boolean;          // at least 640 px wide
  webgl: boolean | null;  // null until checked in the browser
  ready: boolean;         // the page has loaded and the browser is idle
}

export interface FxPlan {
  animate: boolean;      // false: every animation shows its final still state
  heroWebGL: boolean;    // DarkVeil + Particles behind the hero (else the CSS gradient)
  galleryWebGL: boolean; // CircularGallery (else a static row of images)
  ghostCursor: boolean;  // GhostCursor trail
  sparks: boolean;       // ClickSpark
}

export function fxPlan(e: FxEnv): FxPlan {
  const animate = !e.reducedMotion;
  const gl = animate && e.ready && e.webgl === true;
  return {
    animate,
    heroWebGL: gl && e.wide,
    galleryWebGL: gl,
    ghostCursor: gl && e.wide && e.pointerFine,
    sparks: animate && e.ready,
  };
}

export const cappedDpr = (dpr: number | undefined): number => Math.min(dpr && dpr > 0 ? dpr : 1, MAX_DPR);

export const isScrolled = (y: number): boolean => y > SCROLLED_AT;

interface GlLike { getExtension?(name: string): { loseContext?(): void } | null }
export interface CanvasLike { getContext(id: string): unknown }

// True when a WebGL (2 or 1) context can be made. The test context is released straight away.
export function webglAvailable(makeCanvas: () => CanvasLike | null): boolean {
  try {
    const canvas = makeCanvas();
    if (!canvas) return false;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as GlLike | null;
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
````

- [ ] **Step 7: Run the test**

Run: `npx vitest run apps/web/test/fx.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 8: Add the hooks** — `apps/web/lib/use-fx.ts` (hooks are verified in the browser in Task 11, not unit-tested):

````ts
"use client";
// Browser facts for lib/fx.ts. Every hook returns its server value (no motion preference, no WebGL, not ready)
// during the static export and the first client render, then the real one: no hydration mismatches.
import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { fxPlan, webglAvailable, type FxPlan } from "./fx";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export const useReducedMotion = (): boolean => useMediaQuery("(prefers-reduced-motion: reduce)");
export const usePointerFine = (): boolean => useMediaQuery("(hover: hover) and (pointer: fine)");
export const useWide = (): boolean => useMediaQuery("(min-width: 640px)");

const never = () => () => {};
let webglCache: boolean | null = null; // checked once per page load
export function useWebGL(): boolean | null {
  return useSyncExternalStore(never, () => (webglCache ??= webglAvailable(() => document.createElement("canvas"))), () => null);
}

// True once the page has loaded and the browser is idle: heavy effects start after first paint, never before.
export function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idle = 0;
    let timer = 0;
    const go = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else timer = window.setTimeout(() => setReady(true), 300);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      window.removeEventListener("load", go);
      if (idle) window.cancelIdleCallback?.(idle);
      clearTimeout(timer);
    };
  }, []);
  return ready;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

// active: on (or near) the screen and the tab is visible, so animations may run. seen: has been near the screen once.
export function useVisibility(ref: RefObject<Element | null>, rootMargin = "200px"): { active: boolean; seen: boolean } {
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return { active: inView && !hidden, seen };
}

export function useFx(): FxPlan {
  const reducedMotion = useReducedMotion();
  const pointerFine = usePointerFine();
  const wide = useWide();
  const webgl = useWebGL();
  const ready = useIdleReady();
  return fxPlan({ reducedMotion, pointerFine, wide, webgl, ready });
}
````

- [ ] **Step 9: Add the error boundary** — `apps/web/components/fx/FxBoundary.tsx`:

````tsx
"use client";
import { Component, type ReactNode } from "react";

// A visual effect that throws (no WebGL context, a driver bug) shows its static fallback instead of breaking the page.
export class FxBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
````

- [ ] **Step 10: Typecheck, lint, build**

```bash
npm run typecheck
(cd apps/web && npx eslint)
npm run build
```

Expected: all three succeed (build ends with the route table `○ /`, `○ /coin`, `○ /launch`).

- [ ] **Step 11: Commit**

```bash
git add apps/web/package.json package.json package-lock.json apps/web/eslint.config.mjs apps/web/lib/fx.ts apps/web/lib/use-fx.ts apps/web/components/fx/FxBoundary.tsx apps/web/test/fx.test.ts
git commit -F - <<'EOF'
feat(web): effect helpers and animation dependencies for the redesign

fxPlan decides which effects may run (reduced motion, touch, width, WebGL, page ready);
hooks feed it browser facts. Adds gsap, @gsap/react, motion, ogl, three and sharp.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Showcase art (script, images, owner approval)

**Files:**
- Create: `scripts/showcase-art-lib.mjs`, `scripts/make-showcase-art.mjs`, `scripts/test/showcase-art.test.ts`, `apps/web/public/showcase/{plain,ghost,witch,vampire,pumpkin,mummy,skeleton,devil}.webp`
- Modify: `package.json` (root script `showcase-art`)

**Interfaces:**
- Consumes: `SEED_COSTUMES`, `buildPrompt` from `packages/core/src/costumes.ts`; `openRouter`, `DEFAULT_MODEL` from `packages/functions/src/openrouter.ts` (the production client: same request shape and model as live costumes); `sharp` (Task 1).
- Produces: eight committed files `apps/web/public/showcase/<slug>.webp`, square, ≤ 200 KB, served at `/showcase/<slug>.webp` (used by Tasks 4, 5, 8). Slugs in order: `plain, ghost, witch, vampire, pumpkin, mummy, skeleton, devil`. Full-size PNGs in `.data/showcase/` (gitignored).
- `showcase-art-lib.mjs` exports: `SHOWCASE_SLUGS: string[]`, `MAX_BYTES = 204800`, `MASCOT_PROMPT: string`, `parseArgs(argv: string[]): { only: string | null }`, `readSecret(text: string, key: string): string`, `generateImage({ apiKey, model, prompt, fetchFn? }): Promise<Uint8Array>`, `encodeShowcase(bytes, { maxBytes?, sizes? }?): Promise<Buffer>`.

The script runs `.ts` imports through Node 22's type stripping (`node --experimental-strip-types`, verified on Node 22.15). It reads `OPENROUTER_API_KEY` from the environment or from the gitignored `.env.secrets` at the repo root and never prints it. Cost: about $0.25 of OpenRouter credit (1 text-to-image + 7 costume edits).

- [ ] **Step 1: Write the failing test** — `scripts/test/showcase-art.test.ts`:

````ts
import sharp from "sharp";
import { describe, expect, test } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { encodeShowcase, generateImage, parseArgs, readSecret, SHOWCASE_SLUGS } from "../showcase-art-lib.mjs";

test("the eight showcase images", () => {
  expect(SHOWCASE_SLUGS).toEqual(["plain", "ghost", "witch", "vampire", "pumpkin", "mummy", "skeleton", "devil"]);
});

test("--only picks one known image", () => {
  expect(parseArgs([])).toEqual({ only: null });
  expect(parseArgs(["--only", "witch"])).toEqual({ only: "witch" });
  expect(() => parseArgs(["--only"])).toThrow(/needs a slug/);
  expect(() => parseArgs(["--only", "zombie"])).toThrow(/Unknown costume: zombie/);
  expect(() => parseArgs(["--all"])).toThrow(/Unknown option/);
});

test("reads one secret from a .env-style file", () => {
  const text = "# comment\r\nHELIUS_API_KEY=abc\r\nOPENROUTER_API_KEY=\"sk-or-123\"\r\n";
  expect(readSecret(text, "OPENROUTER_API_KEY")).toBe("sk-or-123");
  expect(readSecret("OPENROUTER_API_KEY=sk-or-9", "OPENROUTER_API_KEY")).toBe("sk-or-9");
  expect(readSecret(text, "MISSING")).toBe("");
});

describe("generateImage", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  test("sends the production request shape without an input image and returns the bytes", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization };
      return new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }] } }] }));
    }) as unknown as typeof fetch;
    const bytes = await generateImage({ apiKey: "k", model: "m", prompt: "a mascot", fetchFn });
    expect([...bytes]).toEqual([...png]);
    expect(sent).toEqual({
      url: "https://openrouter.ai/api/v1/chat/completions",
      auth: "Bearer k",
      body: { model: "m", modalities: ["image", "text"], image_config: { aspect_ratio: "1:1" },
        messages: [{ role: "user", content: [{ type: "text", text: "a mascot" }] }] },
    });
  });
  test("fails clearly on HTTP errors and answers without an image", async () => {
    const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    await expect(generateImage({ apiKey: "k", model: "m", prompt: "p", fetchFn: reply("no credit", 402) })).rejects.toThrow(/HTTP 402/);
    await expect(generateImage({ apiKey: "k", model: "m", prompt: "p", fetchFn: reply(JSON.stringify({ choices: [{ message: { content: "no" } }] })) }))
      .rejects.toThrow(/didn't return an image/);
  });
});

describe("encodeShowcase", () => {
  test("makes a 768 px square webp under 200 KB", async () => {
    const input = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#5a2d82" } }).png().toBuffer();
    const out = await encodeShowcase(input);
    expect(out.length).toBeLessThanOrEqual(200 * 1024);
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 768, 768]);
  });
  test("refuses when nothing fits", async () => {
    const input = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(encodeShowcase(input, { maxBytes: 10 })).rejects.toThrow(/under 10 bytes/);
  });
});
````

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/test/showcase-art.test.ts`
Expected: FAIL — `Failed to resolve import "../showcase-art-lib.mjs"`.

- [ ] **Step 3: Implement** `scripts/showcase-art-lib.mjs`:

````js
// The testable parts of scripts/make-showcase-art.mjs: arguments, the secrets file, the text-to-image call and
// the webp encoding.
import sharp from "sharp";
import { SEED_COSTUMES } from "../packages/core/src/costumes.ts";

export const SHOWCASE_SLUGS = ["plain", ...SEED_COSTUMES.map((c) => c.slug)];
export const MAX_BYTES = 200 * 1024;

// The bare mascot. Original (no existing character), simple shapes, no costume pieces, so every costume reads well.
export const MASCOT_PROMPT =
  "Design an original, cute mascot character for a Halloween meme-coin launchpad called SpookPad: a small, round, " +
  "soft mint-green blob creature with big friendly eyes, a tiny smile and short stubby arms and legs. Simple shapes, " +
  "bold clean outlines, flat cel-shaded cartoon style. Full body, standing, facing the viewer, centered with space " +
  "around it, on a plain deep purple (#1a1230) background. No clothes, no hat, no accessories, no costume, no text, " +
  "no letters, no watermark. Square image.";

// `--only <slug>` regenerates one image; nothing else is accepted.
export function parseArgs(argv) {
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--only") throw new Error(`Unknown option: ${argv[i]}`);
    const slug = argv[++i];
    if (!slug) throw new Error("--only needs a slug, e.g. --only witch");
    if (!SHOWCASE_SLUGS.includes(slug)) throw new Error(`Unknown costume: ${slug}. Use one of ${SHOWCASE_SLUGS.join(", ")}.`);
    only = slug;
  }
  return { only };
}

// One KEY=value from a .env-style file ("" when missing). Quotes are stripped; the value is never printed.
export function readSecret(text, key) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0 || line.slice(0, eq).trim() !== key) continue;
    return line.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return "";
}

// Text-to-image with the same request shape as packages/functions/src/openrouter.ts (no input image).
export async function generateImage({ apiKey, model, prompt, fetchFn = fetch }) {
  const res = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "SpookPad" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "1:1" },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const body = await res.json();
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = typeof url === "string" ? /^data:image\/[a-z+.-]+;base64,(.+)$/s.exec(url) : null;
  if (!m) throw new Error("OpenRouter didn't return an image");
  return new Uint8Array(Buffer.from(m[1], "base64"));
}

// A square webp of at most maxBytes: 768 px first, lower quality, then smaller sizes until it fits.
export async function encodeShowcase(bytes, { maxBytes = MAX_BYTES, sizes = [768, 640, 512] } = {}) {
  for (const size of sizes) {
    for (let quality = 86; quality >= 50; quality -= 8) {
      const out = await sharp(bytes).resize(size, size, { fit: "cover" }).webp({ quality, effort: 5 }).toBuffer();
      if (out.length <= maxBytes) return out;
    }
  }
  throw new Error(`Couldn't get the image under ${maxBytes} bytes`);
}
````

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/test/showcase-art.test.ts`
Expected: PASS (7 tests). Also `npm run typecheck` passes (the root tsconfig includes `scripts/test`; the `@ts-expect-error` line is the repo's convention for importing `.mjs`).

- [ ] **Step 5: Write the script** — `scripts/make-showcase-art.mjs`:

````js
// One-off: makes the home page's showcase art (redesign spec "Mascot artwork"). Generates the bare SpookPad mascot
// with OpenRouter's image model, then dresses it in every seed costume with the production prompt (buildPrompt) and
// the production client (packages/functions/src/openrouter.ts), and writes apps/web/public/showcase/<slug>.webp
// (square, at most 200 KB). The full-size PNGs go to .data/showcase/ (gitignored). About $0.25 of OpenRouter credit.
//   npm run showcase-art                  everything: a new bare mascot, then all 7 costumes
//   npm run showcase-art -- --only witch  one image again (costumes are dressed from .data/showcase/plain.png)
// OPENROUTER_API_KEY comes from the environment or from .env.secrets at the repo root. It is never printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { buildPrompt, SEED_COSTUMES } from "../packages/core/src/costumes.ts";
import { DEFAULT_MODEL, openRouter } from "../packages/functions/src/openrouter.ts";
import { encodeShowcase, generateImage, MASCOT_PROMPT, parseArgs, readSecret, SHOWCASE_SLUGS } from "./showcase-art-lib.mjs";

const OUT = "apps/web/public/showcase";
const RAW = ".data/showcase";

const { only } = parseArgs(process.argv.slice(2));
const apiKey = process.env.OPENROUTER_API_KEY
  || (existsSync(".env.secrets") ? readSecret(readFileSync(".env.secrets", "utf8"), "OPENROUTER_API_KEY") : "");
if (!apiKey) throw new Error("Set OPENROUTER_API_KEY, or put it in .env.secrets at the repo root.");
const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL; // the production costume model
const ai = openRouter({ apiKey, model });
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const targets = only ? [only] : SHOWCASE_SLUGS;
const write = async (slug, bytes) => {
  writeFileSync(`${RAW}/${slug}.png`, await sharp(bytes).png().toBuffer());
  const webp = await encodeShowcase(bytes);
  writeFileSync(`${OUT}/${slug}.webp`, webp);
  console.log(`wrote ${OUT}/${slug}.webp (${Math.round(webp.length / 1024)} KB)`);
};

if (targets.includes("plain")) {
  await write("plain", await generateImage({ apiKey, model, prompt: MASCOT_PROMPT }));
  if (only) console.log("The costumes were dressed from the old mascot: run without --only to make them all again.");
}

const costumes = SEED_COSTUMES.filter((c) => targets.includes(c.slug));
if (costumes.length) {
  const plain = existsSync(`${RAW}/plain.png`)
    ? readFileSync(`${RAW}/plain.png`)
    : await sharp(readFileSync(`${OUT}/plain.webp`)).png().toBuffer();
  for (const c of costumes) {
    const out = await ai.edit({ bytes: new Uint8Array(plain), type: "image/png" }, buildPrompt(c.prompt));
    await write(c.slug, out.bytes);
  }
}
console.log(`OpenRouter credit left: $${await ai.credits()}`);
````

Add to the root `package.json` `"scripts"` (after `"build"`): `"showcase-art": "node --experimental-strip-types scripts/make-showcase-art.mjs"`

- [ ] **Step 6: Check the script's guards without spending credit**

Run: `npm run showcase-art -- --only zombie`
Expected: exits with `Error: Unknown costume: zombie. Use one of plain, ghost, …` (an ExperimentalWarning about type stripping is normal). No API call is made.

- [ ] **Step 7: Commit the script**

```bash
git add scripts/showcase-art-lib.mjs scripts/make-showcase-art.mjs scripts/test/showcase-art.test.ts package.json
git commit -F - <<'EOF'
feat: one-off script that makes the home page's showcase mascot art

Generates the bare mascot with OpenRouter's image model, then dresses it in the 7 seed
costumes with the production prompt and client; writes square webp files of at most 200 KB.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Generate the art (spends ~$0.25)**

Run: `npm run showcase-art`
Expected: eight lines `wrote apps/web/public/showcase/<slug>.webp (<n> KB)` with every n ≤ 200, then `OpenRouter credit left: $…`. If one costume fails (an `AiRefused` or HTTP error), rerun just that one: `npm run showcase-art -- --only <slug>`.

Check: `ls -l apps/web/public/showcase/` shows 8 files, each ≤ 204800 bytes.

- [ ] **Step 9: Commit the images**

```bash
git add apps/web/public/showcase/*.webp
git commit -F - <<'EOF'
feat(web): showcase mascot art (bare + 7 costumes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 10: HUMAN APPROVAL CHECKPOINT — stop here**

Report to the controller with the eight file paths (`apps/web/public/showcase/*.webp`, full-size PNGs in `.data/showcase/`). **The controller shows the images to the owner and waits for approval. Do not start Tasks 4, 5 or 8 (they use the images) before the owner approves.** (Task 3 does not use them and may proceed.)
- If the owner rejects one costume: `npm run showcase-art -- --only <slug>`, then commit with `git add apps/web/public/showcase/<slug>.webp` and message `fix(web): regenerate the <slug> showcase image` (+ trailer), and ask again.
- If the owner rejects the bare mascot itself: `npm run showcase-art` (all eight again, ~$0.25), commit, ask again.

---

### Task 3: Public stats view `v_stats`

**Files:**
- Create: `supabase/migrations/0002_stats.sql`, `supabase/tests/stats.test.ts`
- Modify: `apps/web/lib/public-data.ts`

**Interfaces:**
- Consumes: tables `launches`, `generations`; SQL functions `start_generation`, `begin_launch`, `confirm_launch` (0001); test helper `startTestDb()` (`supabase/tests/helpers/db.ts`).
- Produces: view `v_stats(coins_launched int, costumes_summoned int)` granted to `anon, authenticated`; in `lib/public-data.ts`: `interface Stats { coins_launched: number; costumes_summoned: number }` and `fetchStats(): Promise<Stats>` (throws `"Couldn't load SpookPad's numbers."` on error). Used by Task 6.

Important: the lock-down block revokes **every** grant on views too (views are tables to `revoke … on all tables`), so this migration must re-grant 0001's browser views after it. The last test checks exactly that.

- [ ] **Step 1: Write the failing test** — `supabase/tests/stats.test.ts`:

````ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

let db: TestDb;
const W1 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "5".repeat(88);

beforeAll(async () => {
  db = await startTestDb();
  await db.sql`insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
    (${db.sql.json({ sub: `web3:solana:${W1}` })}, ${db.sql.json({ provider: "web3" })})`;
});
afterAll(async () => { await db?.stop(); });

const stats = async () => (await db.as("anon", null, (tx) => tx`select * from v_stats`)).map((r) => ({ ...r }));

test("browsers read the counts, which start at zero", async () => {
  expect(await stats()).toEqual([{ coins_launched: 0, costumes_summoned: 0 }]);
  await expect(db.as("authenticated", null, (tx) => tx`select * from v_stats`)).resolves.toHaveLength(1);
});

test("v_stats has the two counts and nothing else (no wallets)", async () => {
  const cols = await db.sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'v_stats'
    order by ordinal_position`;
  expect(cols.map((c) => c.column_name)).toEqual(["coins_launched", "costumes_summoned"]);
});

test("counts finished costumes and live coins only", async () => {
  const ready = crypto.randomUUID();
  const brewing = crypto.randomUUID();
  for (const id of [ready, brewing]) {
    await db.sql`select start_generation(${id}::uuid, ${W1}, ${crypto.randomUUID()}::uuid, 'ghost', ${`originals/${id}.png`})`;
  }
  await db.sql`update generations set state = 'ready', result_path = ${`costumes/${ready}.png`} where id = ${ready}`;
  expect(await stats()).toEqual([{ coins_launched: 0, costumes_summoned: 1 }]);

  await db.sql`select * from begin_launch(${MINT}, ${W1}, ${ready}::uuid, 'Spooky Frog', 'SFROG', 'Boo.', null, null, 0, 'https://ipfs.io/ipfs/meta', 20000000)`;
  expect((await stats())[0].coins_launched).toBe(0); // a pending launch isn't a coin yet
  await db.sql`select * from confirm_launch(${MINT}, ${W1}, ${SIG})`;
  expect(await stats()).toEqual([{ coins_launched: 1, costumes_summoned: 1 }]);
});

test("0001's browser views are still granted after this migration's lock-down", async () => {
  for (const v of ["v_settings_public", "v_costumes", "v_graveyard"]) {
    await expect(db.as("anon", null, (tx) => tx.unsafe(`select * from ${v}`)), v).resolves.toBeDefined();
  }
  const [{ id }] = await db.sql`select id from users where wallet = ${W1}`;
  await expect(db.as("authenticated", id, (tx) => tx`select id from v_my_generations`)).resolves.toHaveLength(2);
  await expect(db.as("anon", null, (tx) => tx`select * from v_my_generations`)).rejects.toThrow(/permission denied/);
});
````

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run supabase/tests/stats.test.ts`
Expected: FAIL — `relation "v_stats" does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0002_stats.sql`:

````sql
-- Public counts for the home page's stats (redesign spec "Data"). Counts only: no wallets, no rows.
-- Like the other views it runs with its owner's rights, so it can count the locked tables.
create view v_stats as
  select (select count(*) from launches where state = 'live')::int as coins_launched,
         (select count(*) from generations where result_path is not null)::int as costumes_summoned;

-- ===== lock-down (repeat at the end of every migration) =====
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- ===== end lock-down =====

-- The lock-down above also took back 0001's view grants (views count as tables): grant every browser view again.
grant select on v_settings_public, v_costumes, v_graveyard, v_stats to anon, authenticated;
grant select on v_my_generations to authenticated;
````

- [ ] **Step 4: Run the SQL tests**

Run: `npx vitest run supabase/tests`
Expected: PASS — all 4 files (schema, generations, launches, stats); `schema.test.ts` still proves browsers can't read tables or call functions.

- [ ] **Step 5: Add `fetchStats`** to `apps/web/lib/public-data.ts`. Replace

````ts
export interface Costume { slug: string; label: string; emoji: string; sort: number }
````

with

````ts
export interface Costume { slug: string; label: string; emoji: string; sort: number }
export interface Stats { coins_launched: number; costumes_summoned: number }
````

and append at the end of the file:

````ts

// Public counts for the home page (v_stats, migration 0002): counts only.
export async function fetchStats(): Promise<Stats> {
  const { data, error } = await supabase().from("v_stats").select("*").single();
  if (error) throw new Error("Couldn't load SpookPad's numbers.");
  const s = data as Record<string, unknown>;
  return { coins_launched: Number(s.coins_launched), costumes_summoned: Number(s.costumes_summoned) };
}
````

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0002_stats.sql supabase/tests/stats.test.ts apps/web/lib/public-data.ts
git commit -F - <<'EOF'
feat: public v_stats view (coins launched, costumes summoned) for the home page

Counts only, no wallets. Ends with the lock-down block and grants the browser views again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Deploying the migration — CONTROLLER ONLY, not the implementer**

Do **not** run this as the implementer. The controller runs it as a separate, explicit step with the owner's go-ahead (it changes the live database):

```bash
npx supabase db push
```

Until it is deployed, the live site's counters show `—` (fetchStats fails and is caught); nothing else breaks.

---
### Task 4: Site-wide: styles, header, footer mascot, sparks and ghost cursor

**Files:**
- Create: `apps/web/components/bits/ClickSpark.tsx`, `apps/web/components/bits/GhostCursor.tsx`, `apps/web/components/fx/SiteFx.tsx`
- Modify: `apps/web/app/globals.css`, `apps/web/components/Header.tsx`, `apps/web/components/Footer.tsx`, `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: `useFx()`, `isScrolled()`, `FxBoundary` (Task 1); `/showcase/plain.webp` (Task 2, approved).
- Produces:
  - CSS classes used later: `.full-bleed` (100vw band inside the centered main column), `.hero-bleed` (full-bleed + slides up under the sticky header using `--header-h`), `.hero-gradient` (hero background without WebGL), `.split-parent` failsafe (SplitText, Task 5), `.cauldron-bubbles` / `.cauldron-fire` (Task 10), `.dissolve-in` (Task 10), `.peek-in` (Task 9), `.reveal-range` (Task 10); `html` gets `scroll-padding-top` and smooth anchor scrolling only without reduced motion.
  - CSS variable `--header-h` (px) set on `<html>` by `Header` (ResizeObserver), default `4.5rem`.
  - `bits/ClickSpark.tsx` default export `ClickSpark(props: { sparkColor?, sparkSize?, sparkRadius?, sparkCount?, duration?, extraScale? })` — a fixed full-viewport canvas listening to window clicks.
  - `bits/GhostCursor.tsx` default export `GhostCursor` (upstream props incl. `color`, `brightness`, `trailLength`, `bloomStrength`, `zIndex`), listening to the whole page.
  - `fx/SiteFx.tsx`: `SiteFx()` mounted once in the root layout.
  - `Header` is now a Client Component; nav "Graveyard" links to `/#graveyard` (the id is added in Task 5).

- [ ] **Step 1: Replace `apps/web/app/globals.css`** with (the original rules are unchanged; everything after `/* ===== redesign ===== */` is new, and the reduced-motion block at the end gains one line):

````css
@import "tailwindcss";

@theme {
  --color-night: #0d0a14;
  --color-night-2: #171124;
  --color-line: #2c2340;
  --color-ghost: #f4f1ea;
  --color-muted: #a79fb8;
  --color-pumpkin: #ff7a1a;
  --color-blood: #ff4d6d;
  --color-slime: #9be15d;
  --font-display: var(--font-creepster), cursive;
  --font-sans: var(--font-grotesk), system-ui, sans-serif;
}

html { color-scheme: dark; }
body {
  background: radial-gradient(1200px 600px at 50% -10%, #2a1846 0%, var(--color-night) 60%) fixed, var(--color-night);
  color: var(--color-ghost);
  font-family: var(--font-sans);
}
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  border-radius: 999px; padding: .65rem 1.25rem; font-weight: 700;
  background: var(--color-pumpkin); color: var(--color-night);
  transition: transform .15s, box-shadow .15s;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 0 24px #ff7a1a66; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn:focus-visible { outline: 2px solid var(--color-ghost); outline-offset: 3px; }
.btn-ghost { background: transparent; color: var(--color-ghost); border: 2px solid var(--color-line); }
.card { background: color-mix(in srgb, var(--color-night-2) 88%, transparent); border: 1px solid var(--color-line); border-radius: 1.25rem; }
.input {
  width: 100%; background: var(--color-night); border: 1px solid var(--color-line); border-radius: .75rem;
  padding: .6rem .8rem; color: var(--color-ghost);
}
.input:focus { outline: 2px solid var(--color-pumpkin); outline-offset: 1px; }
.label { display: grid; gap: .35rem; font-size: .875rem; color: var(--color-muted); }
.fog { pointer-events: none; position: fixed; inset: auto 0 0 0; height: 40vh; background: linear-gradient(to top, #2a184666, transparent); z-index: -1; }
@keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
.float { animation: float 4s ease-in-out infinite; }
/* ===== redesign ===== */
html { scroll-padding-top: calc(var(--header-h, 4.5rem) + 1rem); }
body { overflow-x: clip; }
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
  /* SplitText reveals the hero title; if its script never runs, the title still appears after 2.5 s */
  .split-parent { opacity: 0; animation: split-failsafe 0s linear 2.5s forwards; }
}
@keyframes split-failsafe { to { opacity: 1; } }

/* a full-width band inside the centered main column */
.full-bleed { width: 100vw; margin-left: calc(50% - 50vw); }
/* the hero also slides up under the sticky header and main's top padding (2rem) */
.hero-bleed {
  width: 100vw; margin-left: calc(50% - 50vw);
  margin-top: calc(-1 * (var(--header-h, 4.5rem) + 2rem)); padding-top: var(--header-h, 4.5rem);
}
/* the hero's background without WebGL (phones, no WebGL, reduced motion) and under the WebGL layers */
.hero-gradient {
  background:
    radial-gradient(60% 50% at 70% 35%, #ff7a1a22 0%, transparent 70%),
    radial-gradient(90% 70% at 30% 20%, #3a1d5e 0%, #1a1030 50%, var(--color-night) 100%);
}

@keyframes bubble { 0% { transform: translateY(0) scale(.6); opacity: 0 } 30% { opacity: 1 } 100% { transform: translateY(-26px) scale(1.1); opacity: 0 } }
.cauldron-bubbles circle { animation: bubble 1.8s ease-in infinite; transform-box: fill-box; transform-origin: center; }
.cauldron-bubbles circle:nth-child(2) { animation-delay: .6s; }
.cauldron-bubbles circle:nth-child(3) { animation-delay: 1.2s; }
@keyframes flicker { 0%, 100% { transform: scaleY(1) } 50% { transform: scaleY(.75) } }
.cauldron-fire path { animation: flicker .5s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom; }
.cauldron-fire path:nth-child(2) { animation-delay: .15s; }
@keyframes dissolve-in { from { opacity: 0; filter: blur(12px) saturate(0); transform: scale(1.04) } to { opacity: 1; filter: none; transform: none } }
.dissolve-in { animation: dissolve-in .9s ease-out both; }
@keyframes peek-in { from { opacity: 0 } to { opacity: 1 } }
.peek-in { animation: peek-in .25s ease-out both; }
.reveal-range { width: 100%; accent-color: var(--color-pumpkin); cursor: ew-resize; }

@media (prefers-reduced-motion: reduce) {
  .float { animation: none; }
  .btn { transition: none; }
  .cauldron-bubbles circle, .cauldron-fire path, .dissolve-in, .peek-in { animation: none; }
}
````

- [ ] **Step 2: Replace `apps/web/components/Header.tsx`** with:

````tsx
"use client";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { isScrolled } from "@/lib/fx";
import { WalletButton } from "./WalletButton";

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};

// Transparent over the hero; frosted, with a smaller logo, once the page scrolls. Its height never changes with the
// scroll (no layout shift): the shrink is a transform. It publishes its height as --header-h for the hero.
export function Header() {
  const ref = useRef<HTMLElement>(null);
  const scrolled = useSyncExternalStore(subscribeScroll, () => isScrolled(window.scrollY), () => false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header
      ref={ref}
      className={`sticky top-0 z-40 w-full border-b transition-colors duration-300 ${
        scrolled ? "border-line bg-night/70 backdrop-blur-md" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className={`origin-left font-display text-2xl tracking-wide sm:text-3xl text-pumpkin transition-transform duration-300 ${scrolled ? "scale-[0.85]" : ""}`}
        >
          Spook<span className="text-ghost">Pad</span> <span aria-hidden className="hidden sm:inline">👻</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-4">
          <Link href="/#graveyard" className="hidden text-muted hover:text-ghost sm:inline">Graveyard</Link>
          <Link href="/launch/" className="text-muted hover:text-ghost">Launch</Link>
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
````

- [ ] **Step 3: Replace `apps/web/components/Footer.tsx`** with:

````tsx
export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-8 text-sm text-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/showcase/plain.webp" alt="" aria-hidden width={64} height={64} loading="lazy" className="float h-16 w-16 shrink-0 rounded-2xl border border-line" />
      <p>SpookPad launches coins on pump.fun. Coins are created and signed by the traders who launch them. Meme coins are risky: never spend more than you can lose.</p>
    </footer>
  );
}
````

- [ ] **Step 4: ClickSpark** — the upstream file wraps its children in a page-sized canvas and redraws every frame forever, so SpookPad uses an adapted version. Read the upstream for reference (`curl -fsSL https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/ClickSpark/ClickSpark.tsx`), then create `apps/web/components/bits/ClickSpark.tsx`:

````tsx
'use client';
// Adapted from React Bits (https://reactbits.dev) — ClickSpark, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/ClickSpark/ClickSpark.tsx
// SpookPad changes: one fixed full-viewport canvas that listens to clicks on the whole page (no wrapper element, so
// no page-sized canvas); it draws only while sparks are alive; keyboard "clicks" (detail 0) make no sparks.
import { useEffect, useRef } from 'react';

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  extraScale?: number;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

const easeOut = (t: number) => t * (2 - t);

export default function ClickSpark({
  sparkColor = '#fff',
  sparkSize = 10,
  sparkRadius = 15,
  sparkCount = 8,
  duration = 400,
  extraScale = 1.0
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let sparks: Spark[] = [];
    let raf = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparks = sparks.filter(spark => {
        const elapsed = now - spark.startTime;
        if (elapsed >= duration) return false;
        const eased = easeOut(elapsed / duration);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);
        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spark.x + distance * Math.cos(spark.angle), spark.y + distance * Math.sin(spark.angle));
        ctx.lineTo(
          spark.x + (distance + lineLength) * Math.cos(spark.angle),
          spark.y + (distance + lineLength) * Math.sin(spark.angle)
        );
        ctx.stroke();
        return true;
      });
      raf = sparks.length ? requestAnimationFrame(draw) : 0;
    };

    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const now = performance.now();
      for (let i = 0; i < sparkCount; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, angle: (2 * Math.PI * i) / sparkCount, startTime: now });
      }
      if (!raf) raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
    };
  }, [sparkColor, sparkSize, sparkRadius, sparkCount, duration, extraScale]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60]" />;
}
````

- [ ] **Step 5: GhostCursor** — download the pinned file:

````bash
curl -fsSL -o apps/web/components/bits/GhostCursor.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/GhostCursor/GhostCursor.tsx
sha256sum apps/web/components/bits/GhostCursor.tsx | cut -c1-16   # expect 487fc47a457e1403
````

Then apply these edits (each `old` text occurs exactly once):

Edit GhostCursor.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — GhostCursor, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/GhostCursor/GhostCursor.tsx
// SpookPad changes: lives in a fixed full-viewport layer that ignores the pointer, so it listens to the whole page instead of its parent.
````

Edit GhostCursor.2: replace

````tsx
    const onPointerMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
````

with

````tsx
    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
````

Edit GhostCursor.3: replace

````tsx
    parent.addEventListener('pointermove', onPointerMove, { passive: true });
    parent.addEventListener('pointerenter', onPointerEnter, { passive: true });
    parent.addEventListener('pointerleave', onPointerLeave, { passive: true });
````

with

````tsx
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerenter', onPointerEnter, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave, { passive: true });
````

Edit GhostCursor.4: replace

````tsx
      parent.removeEventListener('pointermove', onPointerMove);
      parent.removeEventListener('pointerenter', onPointerEnter);
      parent.removeEventListener('pointerleave', onPointerLeave);
````

with

````tsx
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerenter', onPointerEnter);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
````

- [ ] **Step 6: SiteFx** — create `apps/web/components/fx/SiteFx.tsx`:

````tsx
"use client";
import dynamic from "next/dynamic";
import { useFx } from "@/lib/use-fx";
import { FxBoundary } from "./FxBoundary";

// Loaded only when they will run: a phone never downloads three.js.
const GhostCursor = dynamic(() => import("../bits/GhostCursor"), { ssr: false });
const ClickSpark = dynamic(() => import("../bits/ClickSpark"), { ssr: false });

// Site-wide effects: orange sparks on clicks, and a faint ghost trail behind a mouse pointer (desktop only).
export function SiteFx() {
  const fx = useFx();
  return (
    <>
      {fx.sparks && (
        <FxBoundary fallback={null}>
          <ClickSpark sparkColor="#ff7a1a" sparkSize={10} sparkRadius={20} sparkCount={8} duration={450} />
        </FxBoundary>
      )}
      {fx.ghostCursor && (
        // inline position: GhostCursor makes a parent without an inline position "relative", which would undo `fixed`
        <div aria-hidden className="pointer-events-none inset-0 z-50" style={{ position: "fixed" }}>
          <FxBoundary fallback={null}>
            <GhostCursor color="#b497cf" brightness={0.7} trailLength={36} bloomStrength={0.08} zIndex={50} />
          </FxBoundary>
        </div>
      )}
    </>
  );
}
````

- [ ] **Step 7: Mount it** in `apps/web/app/layout.tsx`. Replace

````tsx
import { Providers } from "@/components/Providers";
````

with

````tsx
import { Providers } from "@/components/Providers";
import { SiteFx } from "@/components/fx/SiteFx";
````

and replace

````tsx
          <Footer />
````

with

````tsx
          <Footer />
          <SiteFx />
````

- [ ] **Step 8: Typecheck, lint, test, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npx vitest run apps/web/test && npm run build
```

Expected: all succeed.

- [ ] **Step 9: Quick look** (full checklist is Task 11): `npx serve@14.2.6 apps/web/out -l 4173`, open `http://localhost:4173/` in Chrome at 1280×800. Clicking anywhere makes orange sparks; moving the mouse leaves a faint purple ghost trail; scrolling 25 px+ turns the header frosted and shrinks the logo without moving the page; the footer shows the bare mascot. Stop the server with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/globals.css apps/web/components/Header.tsx apps/web/components/Footer.tsx apps/web/components/bits/ClickSpark.tsx apps/web/components/bits/GhostCursor.tsx apps/web/components/fx/SiteFx.tsx apps/web/app/layout.tsx
git commit -F - <<'EOF'
feat(web): site-wide redesign: frosted header, footer mascot, click sparks, ghost cursor

ClickSpark and GhostCursor (React Bits) load lazily and only when motion is allowed;
the ghost cursor only with a mouse, on wide screens, with WebGL.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Hero

**Files:**
- Create: `apps/web/lib/showcase.ts`, `apps/web/test/showcase.test.ts`, `apps/web/components/bits/PixelTransition.tsx`, `apps/web/components/bits/SplitText.tsx`, `apps/web/components/bits/DarkVeil.tsx`, `apps/web/components/bits/Particles.tsx`, `apps/web/components/home/HeroBackground.tsx`, `apps/web/components/home/CostumeMorph.tsx`, `apps/web/components/home/Hero.tsx`
- Modify: `apps/web/app/page.tsx`, `apps/web/components/Graveyard.tsx` (section id only)

**Interfaces:**
- Consumes: `useFx`, `useVisibility`, `cappedDpr`, `FxBoundary` (Task 1); `.hero-bleed`, `.hero-gradient`, `.split-parent` CSS (Task 4); the approved `/showcase/*.webp` (Task 2); `SEED_COSTUMES` from `@spookpad/core/costumes`.
- Produces:
  - `lib/showcase.ts`: `interface ShowcaseItem { slug: string; label: string; emoji: string; src: string }`; `SHOWCASE: ShowcaseItem[]` (8: plain then the 7 seed costumes); `CYCLE_MS = 3000`; `STILL_INDEX = 1` (ghost); `GALLERY_ITEMS: { image: string; text: string }[]` (7 costumes, text `"<emoji> <label>"`, used by Task 8); `interface HeroFrame { current: number; slotA: number; slotB: number; showB: boolean }`; `heroFrame(step: number, count: number): HeroFrame`.
  - `bits/PixelTransition.tsx` default export with the new optional prop `active?: boolean`.
  - `bits/DarkVeil.tsx`, `bits/Particles.tsx` default exports with new optional prop `paused?: boolean`.
  - `bits/SplitText.tsx` default export (upstream props).
  - `home/Hero.tsx`: `Hero()`; `home/HeroBackground.tsx`: `HeroBackground({ webgl: boolean; paused: boolean })`; `home/CostumeMorph.tsx`: `CostumeMorph({ animate: boolean; active: boolean })`.
  - `Graveyard`'s `<section>` has `id="graveyard"` (anchor for "See the Graveyard" and the header link).

- [ ] **Step 1: Write the failing test** — `apps/web/test/showcase.test.ts`:

````ts
import { describe, expect, test } from "vitest";
import { CYCLE_MS, GALLERY_ITEMS, heroFrame, SHOWCASE, STILL_INDEX } from "../lib/showcase";

test("the hero cycles plain, then the seven costumes, every 3 s", () => {
  expect(SHOWCASE.map((c) => c.slug)).toEqual(["plain", "ghost", "witch", "vampire", "pumpkin", "mummy", "skeleton", "devil"]);
  expect(SHOWCASE[2]).toEqual({ slug: "witch", label: "Witch", emoji: "🧙", src: "/showcase/witch.webp" });
  expect(CYCLE_MS).toBe(3000);
  expect(SHOWCASE[STILL_INDEX].slug).toBe("ghost");
});

test("the gallery shows the seven costumes with emoji and name", () => {
  expect(GALLERY_ITEMS).toHaveLength(7);
  expect(GALLERY_ITEMS[0]).toEqual({ image: "/showcase/ghost.webp", text: "👻 Ghost sheet" });
});

describe("heroFrame", () => {
  test("starts on plain, then alternates slots", () => {
    expect(heroFrame(0, 8)).toEqual({ current: 0, slotA: 0, slotB: 7, showB: false });
    expect(heroFrame(1, 8)).toEqual({ current: 1, slotA: 0, slotB: 1, showB: true });
    expect(heroFrame(2, 8)).toEqual({ current: 2, slotA: 2, slotB: 1, showB: false });
  });
  test("loops after devil", () => {
    expect(heroFrame(7, 8).current).toBe(7);
    expect(heroFrame(8, 8)).toEqual({ current: 0, slotA: 0, slotB: 7, showB: false });
  });
  test("the visible slot shows the current costume, and the slot being hidden keeps the previous one", () => {
    for (let s = 1; s < 40; s++) {
      const before = heroFrame(s - 1, 8);
      const now = heroFrame(s, 8);
      expect(now.showB ? now.slotB : now.slotA).toBe(now.current);
      const leaving = before.showB ? "slotB" : "slotA";
      expect(now[leaving]).toBe(before[leaving]);
    }
  });
});
````

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run apps/web/test/showcase.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/showcase"`.

- [ ] **Step 3: Implement** `apps/web/lib/showcase.ts`:

````ts
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
````

- [ ] **Step 4: Run the test**

Run: `npx vitest run apps/web/test/showcase.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: PixelTransition** — download:

````bash
curl -fsSL -o apps/web/components/bits/PixelTransition.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/PixelTransition/PixelTransition.tsx
sha256sum apps/web/components/bits/PixelTransition.tsx | cut -c1-16   # expect 42af06b4a9d2144d
````

Upstream reads `window` while rendering (breaks the static export) and is hover-only. Apply:

Edit PixelTransition.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — PixelTransition, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/PixelTransition/PixelTransition.tsx
// SpookPad changes: controlled `active` prop (the hero decides when to dissolve), touch check moved into an effect (SSR-safe), tweens killed on unmount, demo styling removed.
````

Edit PixelTransition.2: replace

````tsx
  aspectRatio?: string;
}
````

with

````tsx
  aspectRatio?: string;
  active?: boolean; // when set, the parent decides which content shows (no hover or click)
}
````

Edit PixelTransition.3: replace

````tsx
  style = {}
}) => {
````

with

````tsx
  style = {},
  active
}) => {
````

Edit PixelTransition.4: replace

````tsx
  const isTouchDevice =
    'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
````

with

````tsx
  // read in the browser after mount: window doesn't exist during the static export
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
  }, []);
  const controlled = active !== undefined;
````

Edit PixelTransition.5: replace

````tsx
  const handleEnter = (): void => {
````

with

````tsx
  // controlled mode: dissolve whenever `active` changes
  useEffect(() => {
    if (active !== undefined && active !== isActive) animatePixels(active);
  }, [active]);
  useEffect(
    () => () => {
      delayedCallRef.current?.kill();
      const pixels = pixelGridRef.current?.querySelectorAll('.pixelated-image-card__pixel');
      if (pixels?.length) gsap.killTweensOf(pixels);
    },
    []
  );

  const handleEnter = (): void => {
````

Edit PixelTransition.6: replace

````tsx
      className={`
        ${className}
        bg-[#222]
        text-white
        rounded-[15px]
        border-2
        border-white
        w-[300px]
        max-w-full
        relative
        overflow-hidden
      `}
````

with

````tsx
      className={`${className} relative overflow-hidden`}
````

Edit PixelTransition.7: replace

````tsx
      onMouseEnter={!isTouchDevice ? handleEnter : undefined}
      onMouseLeave={!isTouchDevice ? handleLeave : undefined}
      onClick={isTouchDevice ? handleClick : undefined}
      onFocus={!isTouchDevice ? handleEnter : undefined}
      onBlur={!isTouchDevice ? handleLeave : undefined}
      tabIndex={0}
````

with

````tsx
      onMouseEnter={!controlled && !isTouchDevice ? handleEnter : undefined}
      onMouseLeave={!controlled && !isTouchDevice ? handleLeave : undefined}
      onClick={!controlled && isTouchDevice ? handleClick : undefined}
      onFocus={!controlled && !isTouchDevice ? handleEnter : undefined}
      onBlur={!controlled && !isTouchDevice ? handleLeave : undefined}
      tabIndex={controlled ? undefined : 0}
````

- [ ] **Step 6: SplitText** — download:

````bash
curl -fsSL -o apps/web/components/bits/SplitText.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/SplitText/SplitText.tsx
sha256sum apps/web/components/bits/SplitText.tsx | cut -c1-16   # expect f740e4b939c2ed1f
````

Apply (globals.css hides `.split-parent` until the split is ready, so the title doesn't flash before animating):

Edit SplitText.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — SplitText, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/SplitText/SplitText.tsx
// SpookPad changes: shows its parent once the split is ready (globals.css hides .split-parent until then, with a 2.5 s failsafe).
````

Edit SplitText.2: replace

````tsx
        onSplit: (self: GSAPSplitText) => {
          assignTargets(self);
````

with

````tsx
        onSplit: (self: GSAPSplitText) => {
          assignTargets(self);
          el.style.opacity = '1';
          el.style.animation = 'none';
````

- [ ] **Step 7: DarkVeil** — download:

````bash
curl -fsSL -o apps/web/components/bits/DarkVeil.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Backgrounds/DarkVeil/DarkVeil.tsx
sha256sum apps/web/components/bits/DarkVeil.tsx | cut -c1-16   # expect da0f12fa13d34422
````

Apply:

Edit DarkVeil.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — DarkVeil, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Backgrounds/DarkVeil/DarkVeil.tsx
// SpookPad changes: device pixel ratio capped at 1.5, `paused` prop (stops drawing off screen), WebGL context released on unmount.
````

Edit DarkVeil.2: replace

````tsx
import { Renderer, Program, Mesh, Triangle, Vec2 } from 'ogl';
````

with

````tsx
import { Renderer, Program, Mesh, Triangle, Vec2 } from 'ogl';
import { cappedDpr } from '@/lib/fx';
````

Edit DarkVeil.3: replace

````tsx
  lightMode?: boolean;
};
````

with

````tsx
  lightMode?: boolean;
  paused?: boolean; // stop drawing while off screen
};
````

Edit DarkVeil.4: replace

````tsx
                                   lightMode = false
                                 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
````

with

````tsx
                                   lightMode = false,
                                   paused = false
                                 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
````

Edit DarkVeil.5: replace

````tsx
dpr: Math.min(window.devicePixelRatio, 2),
````

with

````tsx
dpr: cappedDpr(window.devicePixelRatio),
````

Edit DarkVeil.6: replace

````tsx
      renderer.render({ scene: mesh });
````

with

````tsx
      if (!pausedRef.current) renderer.render({ scene: mesh });
````

Edit DarkVeil.7: replace

````tsx
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
````

with

````tsx
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
````

(Do not pass DarkVeil a `resolutionScale` other than 1: upstream then sizes the canvas's CSS box to the scaled size, leaving part of the hero uncovered.)

- [ ] **Step 8: Particles** — download:

````bash
curl -fsSL -o apps/web/components/bits/Particles.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Backgrounds/Particles/Particles.tsx
sha256sum apps/web/components/bits/Particles.tsx | cut -c1-16   # expect 8f5ff7f2ac125a44
````

Apply:

Edit Particles.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — Particles, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Backgrounds/Particles/Particles.tsx
// SpookPad changes: `paused` prop (stops drawing off screen), WebGL context released on unmount. The caller passes a pixelRatio capped at 1.5.
````

Edit Particles.2: replace

````tsx
  pixelRatio?: number;
  className?: string;
}
````

with

````tsx
  pixelRatio?: number;
  className?: string;
  paused?: boolean; // stop drawing while off screen
}
````

Edit Particles.3: replace

````tsx
  pixelRatio = 1,
  className
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
````

with

````tsx
  pixelRatio = 1,
  className,
  paused = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
````

Edit Particles.4: replace

````tsx
      const delta = t - lastTime;
      lastTime = t;
````

with

````tsx
      const delta = t - lastTime;
      lastTime = t;
      if (pausedRef.current) return;
````

Edit Particles.5: replace

````tsx
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
````

with

````tsx
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
````

- [ ] **Step 9: Create** `apps/web/components/home/HeroBackground.tsx`:

````tsx
"use client";
import dynamic from "next/dynamic";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { cappedDpr } from "@/lib/fx";

const DarkVeil = dynamic(() => import("@/components/bits/DarkVeil"), { ssr: false });
const Particles = dynamic(() => import("@/components/bits/Particles"), { ssr: false });

// The hero's purple fog and drifting embers. The CSS gradient (.hero-gradient) is always there; the WebGL layers go
// on top only when allowed (wide screen, WebGL, motion, page ready), and fall back to nothing if they throw.
export function HeroBackground({ webgl, paused }: { webgl: boolean; paused: boolean }) {
  return (
    <div aria-hidden className="hero-gradient absolute inset-0 -z-10">
      {webgl && (
        <FxBoundary fallback={null}>
          <div className="absolute inset-0 opacity-70">
            <DarkVeil speed={0.35} noiseIntensity={0.03} warpAmount={0.4} paused={paused} />
          </div>
          <div className="absolute inset-0">
            <Particles
              particleCount={120}
              particleSpread={10}
              speed={0.08}
              particleColors={["#ff7a1a", "#ffb347", "#ff4d6d"]}
              particleBaseSize={80}
              alphaParticles
              pixelRatio={cappedDpr(window.devicePixelRatio)}
              paused={paused}
            />
          </div>
        </FxBoundary>
      )}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night to-transparent" />
    </div>
  );
}
````

- [ ] **Step 10: Create** `apps/web/components/home/CostumeMorph.tsx`:

````tsx
"use client";
import { useEffect, useState } from "react";
import PixelTransition from "@/components/bits/PixelTransition";
import { CYCLE_MS, heroFrame, SHOWCASE, STILL_INDEX } from "@/lib/showcase";

// The mascot trying on every costume, one every 3 s, with a pixel dissolve (fixed-size box: no layout shift).
// Still (reduced motion): the ghost costume. Paused while off screen or while the tab is hidden.
export function CostumeMorph({ animate, active }: { animate: boolean; active: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!animate || !active) return;
    const timer = setInterval(() => setStep((s) => s + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [animate, active]);
  useEffect(() => {
    if (!animate) return;
    for (const c of SHOWCASE) new Image().src = c.src; // warm the cache so every swap is instant
  }, [animate]);

  const frame = heroFrame(step, SHOWCASE.length);
  const shown = SHOWCASE[animate ? frame.current : STILL_INDEX];
  const art = (i: number, first = false) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SHOWCASE[i].src} alt="" width={768} height={768} fetchPriority={first ? "high" : "auto"} className="h-full w-full object-cover" />
  );

  return (
    <figure className="grid justify-items-center gap-3" aria-label="The SpookPad mascot trying on costumes">
      <div className="relative aspect-square w-[min(68vw,380px)] overflow-hidden rounded-[2rem] border border-line bg-night-2 shadow-[0_0_80px_#ff7a1a33]">
        {animate ? (
          <PixelTransition
            active={frame.showB}
            firstContent={art(frame.slotA, step === 0)}
            secondContent={art(frame.slotB)}
            gridSize={12}
            pixelColor="#ff7a1a"
            animationStepDuration={0.45}
            className="h-full w-full"
          />
        ) : (
          art(STILL_INDEX, true)
        )}
      </div>
      <figcaption className="font-display text-2xl text-ghost">
        <span aria-hidden>{shown.emoji}</span> {shown.label}
      </figcaption>
    </figure>
  );
}
````

- [ ] **Step 11: Create** `apps/web/components/home/Hero.tsx`:

````tsx
"use client";
import Link from "next/link";
import { useRef } from "react";
import SplitText from "@/components/bits/SplitText";
import { useFx, useVisibility } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";

const TITLE = "Every coin wears a costume";
const TITLE_CLASS = "font-display text-5xl leading-[1.05] text-pumpkin sm:text-7xl";

// Full-viewport opening: what SpookPad does, in a few seconds.
export function Hero() {
  const fx = useFx();
  const ref = useRef<HTMLElement>(null);
  const { active } = useVisibility(ref, "0px");
  return (
    <section ref={ref} aria-label="SpookPad" className="hero-bleed relative isolate grid min-h-[100svh] content-center overflow-hidden">
      <HeroBackground webgl={fx.heroWebGL} paused={!active} />
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-8 sm:py-12 md:grid-cols-[1.15fr_1fr] md:gap-10">
        <div className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
          {fx.animate ? (
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
        </div>
        <CostumeMorph animate={fx.animate} active={active} />
      </div>
      <a href="#stats" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-2xl text-muted motion-safe:animate-bounce">
        <span aria-hidden>↓</span>
        <span className="sr-only">Scroll down</span>
      </a>
    </section>
  );
}
````

- [ ] **Step 12: Use it** — replace `apps/web/app/page.tsx` with:

````tsx
import { Graveyard } from "@/components/Graveyard";
import { Hero } from "@/components/home/Hero";

export default function Home() {
  return (
    <div className="grid gap-24">
      <Hero />
      <Graveyard />
    </div>
  );
}
````

and in `apps/web/components/Graveyard.tsx` replace

````tsx
    <section className="grid gap-4">
````

with

````tsx
    <section id="graveyard" className="grid scroll-mt-24 gap-4">
````

- [ ] **Step 13: Typecheck, lint, test, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npx vitest run apps/web/test && npm run build
```

Expected: all succeed.

- [ ] **Step 14: Quick look** (`npx serve@14.2.6 apps/web/out -l 4173`, Chrome, 1280×800): the hero fills the viewport under a transparent header; purple fog and orange embers move behind it; the title's letters rise in once; the mascot box (fixed size) dissolves in orange pixels to the next costume every ~3 s with the caption changing (No costume → Ghost sheet → … → Devil → No costume); "See the Graveyard" scrolls to the Graveyard. At 375 px wide (DevTools device toolbar) there is no WebGL canvas in the hero (CSS gradient only) and no horizontal scrollbar.

- [ ] **Step 15: Commit**

```bash
git add apps/web/lib/showcase.ts apps/web/test/showcase.test.ts apps/web/components/bits/PixelTransition.tsx apps/web/components/bits/SplitText.tsx apps/web/components/bits/DarkVeil.tsx apps/web/components/bits/Particles.tsx apps/web/components/home/HeroBackground.tsx apps/web/components/home/CostumeMorph.tsx apps/web/components/home/Hero.tsx apps/web/app/page.tsx apps/web/components/Graveyard.tsx
git commit -F - <<'EOF'
feat(web): full-screen hero with the mascot trying on every costume

PixelTransition dissolve every 3 s, SplitText headline, DarkVeil fog and Particles embers
(WebGL only on wide screens with motion allowed; CSS gradient otherwise).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Stats counters, newest-coin ticker, section entrances

**Files:**
- Create: `apps/web/lib/stats.ts`, `apps/web/test/stats.test.ts`, `apps/web/components/bits/CountUp.tsx`, `apps/web/components/bits/ScrollVelocity.tsx`, `apps/web/components/bits/AnimatedContent.tsx`, `apps/web/components/bits/ScrollFloat.tsx`, `apps/web/components/fx/Reveal.tsx`, `apps/web/components/fx/SectionHeading.tsx`, `apps/web/components/home/StatsTicker.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `fetchStats`, `Stats` (Task 3); `fetchCostumes` (existing `lib/public-data.ts`); `fetchGraveyard(limit?: number)`, `GraveCoin` (existing `lib/graveyard.ts`); `useReducedMotion` (Task 1); `.full-bleed` (Task 4).
- Produces:
  - `lib/stats.ts`: `interface Compact { to: number; suffix: "" | "K" | "M" }`; `compactCount(n: number): Compact`; `formatCount(n: number | null | undefined): string` (`"—"` when unknown); `tickerLine(coins: Pick<GraveCoin, "name" | "ticker" | "launched_at">[], max?: number): string | null`.
  - `fx/Reveal.tsx`: `Reveal({ children: ReactNode; className?: string; delay?: number })` — used by Tasks 8, 9, 10.
  - `fx/SectionHeading.tsx`: `SectionHeading({ children: string; className?: string })` — renders the section's `<h2>`; used by Tasks 7, 8, 9.
  - `home/StatsTicker.tsx`: `StatsTicker()`; its section has `id="stats"` (the hero's scroll hint links to it).
  - `bits/ScrollFloat.tsx` default export (upstream props; heading keeps an `aria-label`), `bits/AnimatedContent.tsx`, `bits/CountUp.tsx`, `bits/ScrollVelocity.tsx` default exports (upstream props).

- [ ] **Step 1: Write the failing test** — `apps/web/test/stats.test.ts`:

````ts
import { expect, test } from "vitest";
import { compactCount, formatCount, tickerLine } from "../lib/stats";

test("counters count up to whole numbers, then K and M", () => {
  expect(compactCount(0)).toEqual({ to: 0, suffix: "" });
  expect(compactCount(9_999)).toEqual({ to: 9_999, suffix: "" });
  expect(compactCount(12_345)).toEqual({ to: 12.3, suffix: "K" });
  expect(compactCount(999_999)).toEqual({ to: 1, suffix: "M" });
  expect(compactCount(2_540_000)).toEqual({ to: 2.5, suffix: "M" });
  expect(compactCount(-3)).toEqual({ to: 0, suffix: "" });
});

test("final counter text", () => {
  expect(formatCount(null)).toBe("—");
  expect(formatCount(undefined)).toBe("—");
  expect(formatCount(Number.NaN)).toBe("—");
  expect(formatCount(7)).toBe("7");
  expect(formatCount(1_234)).toBe("1,234");
  expect(formatCount(12_345)).toBe("12.3K");
  expect(formatCount(2_540_000)).toBe("2.5M");
});

const coin = (name: string, ticker: string, launched_at: string) => ({ name, ticker, launched_at });

test("the ticker lists the newest coins first, at most 12, or nothing", () => {
  expect(tickerLine([])).toBeNull();
  expect(tickerLine([coin("Old", "OLD", "2026-10-08T10:00:00Z"), coin("New", "NEW", "2026-10-08T12:00:00Z")]))
    .toBe("New $NEW ✦ Old $OLD ✦");
  const many = Array.from({ length: 20 }, (_, i) => coin(`C${i}`, `T${i}`, new Date(Date.UTC(2026, 9, 1, i)).toISOString()));
  const line = tickerLine(many)!;
  expect(line.split(" ✦").filter(Boolean)).toHaveLength(12);
  expect(line.startsWith("C19 $T19")).toBe(true);
  expect(tickerLine(many, 2)).toBe("C19 $T19 ✦ C18 $T18 ✦");
});
````

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run apps/web/test/stats.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/stats"`.

- [ ] **Step 3: Implement** `apps/web/lib/stats.ts`:

````ts
// Formatting for the home page's counters and the newest-coin ticker.
import type { GraveCoin } from "./graveyard";

export interface Compact { to: number; suffix: "" | "K" | "M" }

// What a counter counts up to: whole numbers below 10,000, then one decimal of K or M.
export function compactCount(n: number): Compact {
  const v = Math.max(0, Math.floor(n));
  if (v < 10_000) return { to: v, suffix: "" };
  const k = Number((v / 1_000).toFixed(1));
  if (k < 1_000) return { to: k, suffix: "K" };
  return { to: Number((v / 1_000_000).toFixed(1)), suffix: "M" };
}

// A counter's final text (also what reduced motion and screen readers get).
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const { to, suffix } = compactCount(n);
  return `${to.toLocaleString("en-US")}${suffix}`;
}

// One ticker line of the newest coins, newest first; null when there are none (the ticker is hidden).
export function tickerLine(coins: Pick<GraveCoin, "name" | "ticker" | "launched_at">[], max = 12): string | null {
  if (!coins.length) return null;
  const newest = [...coins].sort((a, b) => Date.parse(b.launched_at) - Date.parse(a.launched_at)).slice(0, max);
  return `${newest.map((c) => `${c.name} $${c.ticker}`).join(" ✦ ")} ✦`;
}
````

- [ ] **Step 4: Run the test**

Run: `npx vitest run apps/web/test/stats.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: CountUp** — download, then apply the attribution edit:

````bash
curl -fsSL -o apps/web/components/bits/CountUp.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/CountUp/CountUp.tsx
sha256sum apps/web/components/bits/CountUp.tsx | cut -c1-16   # expect abf8eef48056b0d2
````

Edit CountUp.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — CountUp, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/CountUp/CountUp.tsx
// SpookPad changes: none (attribution only).
````

- [ ] **Step 6: ScrollVelocity** — download:

````bash
curl -fsSL -o apps/web/components/bits/ScrollVelocity.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/ScrollVelocity/ScrollVelocity.tsx
sha256sum apps/web/components/bits/ScrollVelocity.tsx | cut -c1-16   # expect 96c9f2f4d7c56f5f
````

Apply:

Edit ScrollVelocity.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — ScrollVelocity, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/ScrollVelocity/ScrollVelocity.tsx
// SpookPad changes: demo font sizes removed (the caller styles the text), root is a div instead of a section.
````

Edit ScrollVelocity.2: replace

````tsx
          className={`${scrollerClassName} flex whitespace-nowrap text-center font-sans text-4xl font-bold tracking-[-0.02em] drop-shadow md:text-[5rem] md:leading-[5rem]`}
````

with

````tsx
          className={`${scrollerClassName} flex whitespace-nowrap`}
````

Edit ScrollVelocity.3: replace

````tsx
    <section>
      {texts.map(
````

with

````tsx
    <div>
      {texts.map(
````

Edit ScrollVelocity.4: replace

````tsx
      ))}
    </section>
  );
};
````

with

````tsx
      ))}
    </div>
  );
};
````

- [ ] **Step 7: AnimatedContent** — download, then apply the attribution edit:

````bash
curl -fsSL -o apps/web/components/bits/AnimatedContent.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/AnimatedContent/AnimatedContent.tsx
sha256sum apps/web/components/bits/AnimatedContent.tsx | cut -c1-16   # expect 1e8d327f33881af1
````

Edit AnimatedContent.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — AnimatedContent, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Animations/AnimatedContent/AnimatedContent.tsx
// SpookPad changes: none (attribution only).
````

- [ ] **Step 8: ScrollFloat** — download:

````bash
curl -fsSL -o apps/web/components/bits/ScrollFloat.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/ScrollFloat/ScrollFloat.tsx
sha256sum apps/web/components/bits/ScrollFloat.tsx | cut -c1-16   # expect aa4e99b40ebeea7b
````

Apply:

Edit ScrollFloat.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — ScrollFloat, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/TextAnimations/ScrollFloat/ScrollFloat.tsx
// SpookPad changes: tween and ScrollTrigger killed on unmount, the heading keeps its text for screen readers (letters are aria-hidden), demo font size removed.
````

Edit ScrollFloat.2: replace

````tsx
    gsap.fromTo(
      charElements,
````

with

````tsx
    const tween = gsap.fromTo(
      charElements,
````

Edit ScrollFloat.3: replace

````tsx
          scrub: true
        }
      }
    );
  }, [scrollContainerRef,
````

with

````tsx
          scrub: true
        }
      }
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [scrollContainerRef,
````

Edit ScrollFloat.4: replace

````tsx
    <h2 ref={containerRef} className={`my-5 overflow-hidden ${containerClassName}`}>
      <span className={`inline-block text-[clamp(1.6rem,4vw,3rem)] leading-[1.5] ${textClassName}`}>{splitText}</span>
    </h2>
````

with

````tsx
    <h2
      ref={containerRef}
      aria-label={typeof children === 'string' ? children : undefined}
      className={`overflow-hidden ${containerClassName}`}
    >
      <span aria-hidden className={`inline-block leading-[1.2] ${textClassName}`}>
        {splitText}
      </span>
    </h2>
````

- [ ] **Step 9: Create** `apps/web/components/fx/Reveal.tsx`:

````tsx
"use client";
import type { ReactNode } from "react";
import AnimatedContent from "@/components/bits/AnimatedContent";
import { useReducedMotion } from "@/lib/use-fx";

// A section or panel that slides in once when scrolled to. With reduced motion it is simply there (same element
// tree either way, so the content never remounts when the preference is read).
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const still = useReducedMotion();
  return (
    <AnimatedContent
      className={className}
      distance={still ? 0 : 40}
      duration={still ? 0 : 0.7}
      initialOpacity={still ? 1 : 0}
      delay={still ? 0 : delay}
      threshold={0.15}
    >
      {children}
    </AnimatedContent>
  );
}
````

- [ ] **Step 10: Create** `apps/web/components/fx/SectionHeading.tsx`:

````tsx
"use client";
import ScrollFloat from "@/components/bits/ScrollFloat";
import { useReducedMotion } from "@/lib/use-fx";

const TEXT = "font-display text-4xl sm:text-5xl";

// A section heading whose letters float up while it scrolls into view; a plain heading with reduced motion.
export function SectionHeading({ children, className = "" }: { children: string; className?: string }) {
  const still = useReducedMotion();
  if (still) return <h2 className={`${TEXT} ${className}`}>{children}</h2>;
  return (
    <ScrollFloat containerClassName={className} textClassName={TEXT} scrollStart="top bottom" scrollEnd="bottom bottom-=15%" stagger={0.03}>
      {children}
    </ScrollFloat>
  );
}
````

- [ ] **Step 11: Create** `apps/web/components/home/StatsTicker.tsx`:

````tsx
"use client";
import { useEffect, useState } from "react";
import CountUp from "@/components/bits/CountUp";
import ScrollVelocity from "@/components/bits/ScrollVelocity";
import { fetchGraveyard } from "@/lib/graveyard";
import { fetchCostumes, fetchStats, type Stats } from "@/lib/public-data";
import { compactCount, formatCount, tickerLine } from "@/lib/stats";
import { useReducedMotion } from "@/lib/use-fx";

// Counters (coins launched, costumes summoned, costumes available) and a ticker of the newest coins.
export function StatsTicker() {
  const still = useReducedMotion();
  const [stats, setStats] = useState<Stats | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchStats().then((s) => alive && setStats(s)).catch(() => {}); // unknown numbers show as —
    fetchCostumes().then((c) => alive && setAvailable(c.length)).catch(() => {});
    fetchGraveyard(12).then((coins) => alive && setLine(tickerLine(coins))).catch(() => {});
    return () => { alive = false; };
  }, []);

  const counters: [string, number | null][] = [
    ["Coins launched", stats?.coins_launched ?? null],
    ["Costumes summoned", stats?.costumes_summoned ?? null],
    ["Costumes in the wardrobe", available],
  ];
  return (
    <section id="stats" aria-label="SpookPad in numbers" className="grid gap-8">
      <dl className="grid gap-4 sm:grid-cols-3">
        {counters.map(([label, n]) => (
          <div key={label} className="card grid gap-1 p-5 text-center">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="min-h-[3.75rem] font-display text-5xl tabular-nums text-pumpkin">
              <Counter value={n} still={still} />
            </dd>
          </div>
        ))}
      </dl>
      {line && <Ticker line={line} still={still} />}
    </section>
  );
}

function Counter({ value, still }: { value: number | null; still: boolean }) {
  if (value === null || still) return <>{formatCount(value)}</>;
  const { to, suffix } = compactCount(value);
  return (
    <>
      <span aria-hidden>
        <CountUp to={to} separator="," duration={1.6} />
        {suffix}
      </span>
      <span className="sr-only">{formatCount(value)}</span>
    </>
  );
}

function Ticker({ line, still }: { line: string; still: boolean }) {
  return (
    <div className="full-bleed border-y border-line bg-night-2/60 py-3">
      <p className="sr-only">Newest coins: {line}</p>
      {still ? (
        <p aria-hidden className="truncate px-4 text-center font-display text-3xl text-ghost/90">{line}</p>
      ) : (
        <div aria-hidden>
          <ScrollVelocity texts={[line]} velocity={40} numCopies={4} scrollerClassName="font-display text-3xl text-ghost/90 sm:text-5xl" />
        </div>
      )}
    </div>
  );
}
````

- [ ] **Step 12: Use it** — replace `apps/web/app/page.tsx` with:

````tsx
import { Graveyard } from "@/components/Graveyard";
import { Reveal } from "@/components/fx/Reveal";
import { Hero } from "@/components/home/Hero";
import { StatsTicker } from "@/components/home/StatsTicker";

export default function Home() {
  return (
    <div className="grid gap-24">
      <Hero />
      <Reveal><StatsTicker /></Reveal>
      <Graveyard />
    </div>
  );
}
````

- [ ] **Step 13: Typecheck, lint, test, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npx vitest run apps/web/test && npm run build
```

Expected: all succeed.

- [ ] **Step 14: Quick look** (served `out/`, with the repo's `.env` Supabase settings baked in by `npm run build`): below the hero three counter cards slide in and count up (coins launched and costumes summoned show `—` until the controller has pushed migration 0002; "Costumes in the wardrobe" counts to 7); when the Graveyard has coins, a full-width ticker of `Name $TICKER ✦ …` drifts and speeds up while you scroll; with no coins the ticker is absent.

- [ ] **Step 15: Commit**

```bash
git add apps/web/lib/stats.ts apps/web/test/stats.test.ts apps/web/components/bits/CountUp.tsx apps/web/components/bits/ScrollVelocity.tsx apps/web/components/bits/AnimatedContent.tsx apps/web/components/bits/ScrollFloat.tsx apps/web/components/fx/Reveal.tsx apps/web/components/fx/SectionHeading.tsx apps/web/components/home/StatsTicker.tsx apps/web/app/page.tsx
git commit -F - <<'EOF'
feat(web): stats counters and newest-coin ticker; section entrance helpers

CountUp counters (final numbers with reduced motion), ScrollVelocity ticker of the newest
coins, Reveal (AnimatedContent) and SectionHeading (ScrollFloat) wrappers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---
### Task 7: How it works (ScrollStack)

**Files:**
- Create: `apps/web/lib/how-it-works.ts`, `apps/web/test/how-it-works.test.ts`, `apps/web/components/bits/ScrollStack.tsx`, `apps/web/components/home/HowItWorks.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `fetchSettings`, `PublicSettings` (existing `lib/public-data.ts`); `solText` (existing `lib/format.ts`); `SectionHeading` (Task 6); `useReducedMotion` (Task 1).
- Produces:
  - `lib/how-it-works.ts`: `interface Step { n: 1 | 2 | 3; emoji: string; title: string; body: string }`; `howItWorksSteps(settings: Pick<PublicSettings, "costume_fee_lamports" | "launch_fee_lamports"> | null): Step[]` (fees as `"…"` while null).
  - `bits/ScrollStack.tsx`: default export `ScrollStack` (upstream props; use `useWindowScroll`) and named export `ScrollStackItem({ children, itemClassName? })`.
  - `home/HowItWorks.tsx`: `HowItWorks()`.

ScrollStack notes (read before editing): upstream's `useWindowScroll` mode creates a page-wide Lenis smooth scroller and measures cards with `getBoundingClientRect` (which includes the card's own transform, so cards jitter). The copy below listens to native `scroll`/`resize` events, measures layout offsets with `offsetTop`, and drops the `lenis` import (the package is not installed). Only one ScrollStack may exist on a page: in window mode it finds its cards with `document.querySelectorAll('.scroll-stack-card')`. Do not wrap `HowItWorks` in `Reveal` (a transformed ancestor would shift the pinned cards while it animates).

- [ ] **Step 1: Write the failing test** — `apps/web/test/how-it-works.test.ts`:

````ts
import { expect, test } from "vitest";
import { howItWorksSteps } from "../lib/how-it-works";

test("three steps with the fees from the public settings", () => {
  const steps = howItWorksSteps({ costume_fee_lamports: 2_000_000, launch_fee_lamports: 30_000_000 });
  expect(steps.map((s) => s.title)).toEqual(["Upload your mascot", "Pick a costume", "Launch on pump.fun"]);
  expect(steps[1].body).toContain("0.002 SOL");
  expect(steps[2].body).toContain("0.03 SOL");
  expect(steps[2].body).toContain("creator fees are yours");
});

test("fees show as … until the settings load", () => {
  const steps = howItWorksSteps(null);
  expect(steps[1].body).toContain("costs …");
  expect(steps[2].body).toContain("fee is …");
  expect(steps.map((s) => s.body).join(" ")).not.toMatch(/SOL/);
});
````

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run apps/web/test/how-it-works.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/how-it-works"`.

- [ ] **Step 3: Implement** `apps/web/lib/how-it-works.ts`:

````ts
// The three "How it works" cards. Fees come from the public settings view, never from constants.
import { solText } from "./format";
import type { PublicSettings } from "./public-data";

export interface Step { n: 1 | 2 | 3; emoji: string; title: string; body: string }

export function howItWorksSteps(settings: Pick<PublicSettings, "costume_fee_lamports" | "launch_fee_lamports"> | null): Step[] {
  const costumeFee = settings ? solText(settings.costume_fee_lamports) : "…";
  const launchFee = settings ? solText(settings.launch_fee_lamports) : "…";
  return [
    { n: 1, emoji: "🖼️", title: "Upload your mascot", body: "Any PNG, JPG or WebP: your coin's own character, exactly as you drew it." },
    { n: 2, emoji: "🪄", title: "Pick a costume", body: `AI dresses your mascot in seconds. Each costume costs ${costumeFee}, and a failed one is retried for free.` },
    { n: 3, emoji: "🎃", title: "Launch on pump.fun", body: `You launch from your own wallet, so pump.fun's creator fees are yours. SpookPad's launch fee is ${launchFee}.` },
  ];
}
````

- [ ] **Step 4: Run the test**

Run: `npx vitest run apps/web/test/how-it-works.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: ScrollStack** — download:

````bash
curl -fsSL -o apps/web/components/bits/ScrollStack.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/ScrollStack/ScrollStack.tsx
sha256sum apps/web/components/bits/ScrollStack.tsx | cut -c1-16   # expect 6843722c6ba7b0b5
````

Apply:

Edit ScrollStack.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — ScrollStack, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/ScrollStack/ScrollStack.tsx
// SpookPad changes: native scroll events instead of Lenis (no smooth-scroll hijacking of the page; works with reduced motion), window-mode offsets ignore the card's own transform, smaller paddings for SpookPad's layout.
````

Edit ScrollStack.2: delete this line:

````tsx
import Lenis from 'lenis';
````

Edit ScrollStack.3: delete this line:

````tsx
  const lenisRef = useRef<Lenis | null>(null);
````

Edit ScrollStack.4: replace

````tsx
    className={`scroll-stack-card relative w-full h-80 my-8 p-12 rounded-[40px] shadow-[0_0_30px_rgba(0,0,0,0.1)] box-border origin-top will-change-transform ${itemClassName}`.trim()}
````

with

````tsx
    className={`scroll-stack-card relative w-full min-h-64 my-6 p-6 sm:p-10 rounded-[32px] shadow-[0_0_30px_rgba(0,0,0,0.35)] box-border origin-top will-change-transform ${itemClassName}`.trim()}
````

Edit ScrollStack.5: replace

````tsx
      if (useWindowScroll) {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      } else {
````

with

````tsx
      if (useWindowScroll) {
        // layout offset without the card's own transform (getBoundingClientRect includes it, which makes cards jitter)
        let top = 0;
        for (let el: HTMLElement | null = element; el; el = el.offsetParent as HTMLElement | null) top += el.offsetTop;
        return top;
      } else {
````

Edit ScrollStack.6: delete the whole `setupLenis` callback — from the line `  const setupLenis = useCallback(() => {` (line 217 of the pinned file) through its closing line `  }, [handleScroll, useWindowScroll]);` (line 271) — and put this in its place:

````tsx
  // native scroll events instead of Lenis
  const listenToScroll = useCallback(() => {
    const target: Window | HTMLElement | null = useWindowScroll ? window : scrollerRef.current;
    if (!target) return () => {};
    target.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      target.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [handleScroll, useWindowScroll]);
````

Edit ScrollStack.7: replace

````tsx
    setupLenis();
````

with

````tsx
    const stopListening = listenToScroll();
````

Edit ScrollStack.8: replace

````tsx
      if (lenisRef.current) {
        lenisRef.current.destroy();
      }
````

with

````tsx
      stopListening();
````

Edit ScrollStack.9: replace

````tsx
    setupLenis,
    updateCardTransforms
  ]);
````

with

````tsx
    listenToScroll,
    updateCardTransforms
  ]);
````

Edit ScrollStack.10: replace

````tsx
      className={`relative w-full h-full overflow-y-auto overflow-x-visible ${className}`.trim()}
````

with

````tsx
      className={`relative w-full ${useWindowScroll ? '' : 'h-full overflow-y-auto overflow-x-visible'} ${className}`.trim()}
````

Edit ScrollStack.11: replace

````tsx
      <div className="scroll-stack-inner pt-[20vh] px-20 pb-[50rem] min-h-screen">
````

with

````tsx
      <div className="scroll-stack-inner pt-[4vh] pb-[24vh]">
````

Check: `grep -n -i lenis apps/web/components/bits/ScrollStack.tsx` prints only the attribution comment line.

- [ ] **Step 6: Create** `apps/web/components/home/HowItWorks.tsx`:

````tsx
"use client";
import { useEffect, useState } from "react";
import ScrollStack, { ScrollStackItem } from "@/components/bits/ScrollStack";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { howItWorksSteps, type Step } from "@/lib/how-it-works";
import { fetchSettings, type PublicSettings } from "@/lib/public-data";
import { useReducedMotion } from "@/lib/use-fx";

// Three cards that stack up as you scroll (window scrolling, no smooth-scroll takeover); a plain list when still.
export function HowItWorks() {
  const still = useReducedMotion();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => alive && setSettings(s)).catch(() => {}); // fees stay "…"
    return () => { alive = false; };
  }, []);
  const steps = howItWorksSteps(settings);
  return (
    <section aria-label="How it works" className="grid gap-4">
      <SectionHeading>How it works</SectionHeading>
      {still ? (
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => <li key={s.n} className="card p-6"><StepBody step={s} /></li>)}
        </ol>
      ) : (
        <ScrollStack useWindowScroll itemDistance={60} itemStackDistance={24} stackPosition="18%" scaleEndPosition="8%" baseScale={0.9} itemScale={0.03}>
          {steps.map((s) => (
            <ScrollStackItem key={s.n} itemClassName="border border-line bg-night-2 text-ghost">
              <StepBody step={s} />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      )}
    </section>
  );
}

function StepBody({ step }: { step: Step }) {
  return (
    <div className="grid gap-3">
      <span className="font-display text-2xl text-pumpkin">Step {step.n}</span>
      <h3 className="flex items-center gap-3 text-2xl font-bold sm:text-3xl"><span aria-hidden>{step.emoji}</span>{step.title}</h3>
      <p className="max-w-2xl text-lg text-muted">{step.body}</p>
    </div>
  );
}
````

- [ ] **Step 7: Use it** — in `apps/web/app/page.tsx` add `import { HowItWorks } from "@/components/home/HowItWorks";` after the `Hero` import, and replace

````tsx
      <Reveal><StatsTicker /></Reveal>
      <Graveyard />
````

with

````tsx
      <Reveal><StatsTicker /></Reveal>
      <HowItWorks />
      <Graveyard />
````

- [ ] **Step 8: Typecheck, lint, test, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npx vitest run apps/web/test && npm run build
```

Expected: all succeed.

- [ ] **Step 9: Quick look**: scrolling through "How it works", each card pins near the top and the next one stacks over it slightly lower, earlier cards shrinking a little; after the third card the stack scrolls away and the next section does not overlap the cards (if it does, raise only `pb-[24vh]` in the ScrollStack inner `div`, e.g. to `pb-[32vh]`, and note it in the commit message). The page itself scrolls normally (no smoothing). Fees in cards 2 and 3 show the live SOL amounts.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/how-it-works.ts apps/web/test/how-it-works.test.ts apps/web/components/bits/ScrollStack.tsx apps/web/components/home/HowItWorks.tsx apps/web/app/page.tsx
git commit -F - <<'EOF'
feat(web): "How it works" stacked cards with fees from the public settings

ScrollStack on native window scrolling (no Lenis takeover); a plain list with reduced motion.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Costume gallery (CircularGallery)

**Files:**
- Create: `apps/web/components/bits/CircularGallery.tsx`, `apps/web/components/home/CostumeGallery.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `GALLERY_ITEMS`, `SHOWCASE` (Task 5); `useFx`, `useVisibility`, `cappedDpr`, `FxBoundary` (Task 1); `SectionHeading`, `Reveal` (Task 6); `.full-bleed` (Task 4); approved `/showcase/*.webp` (Task 2).
- Produces: `bits/CircularGallery.tsx` default export with new optional prop `paused?: boolean`; `home/CostumeGallery.tsx`: `CostumeGallery()`.

Notes: `items` must be a stable array (`GALLERY_ITEMS` is a module constant) — a new array on every render would rebuild the WebGL scene. The canvas text font is read from the page (`getComputedStyle(document.body).fontFamily`, i.e. Space Grotesk) so the gallery doesn't fetch Figtree from Google. The fixed-height box (`h-[420px] sm:h-[520px]`) avoids layout shift; the static row shows while the chunk loads, without WebGL, with reduced motion, or if the gallery throws.

- [ ] **Step 1: CircularGallery** — download:

````bash
curl -fsSL -o apps/web/components/bits/CircularGallery.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/CircularGallery/CircularGallery.tsx
sha256sum apps/web/components/bits/CircularGallery.tsx | cut -c1-16   # expect 3d53e886e9f4d1ac
````

Apply:

Edit CircularGallery.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — CircularGallery, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/CircularGallery/CircularGallery.tsx
// SpookPad changes: device pixel ratio capped at 1.5, no wheel capture (the page scrolls normally), drags start on the gallery only, `paused` prop (stops drawing off screen), WebGL context released on unmount, SpookPad aria-label.
````

Edit CircularGallery.2: replace

````tsx
import { useEffect, useRef } from 'react';
````

with

````tsx
import { useEffect, useRef } from 'react';
import { cappedDpr } from '@/lib/fx';
````

Edit CircularGallery.3: replace

````tsx
  isDown: boolean = false;
  start: number = 0;
````

with

````tsx
  isDown: boolean = false;
  start: number = 0;
  paused: boolean = false;
````

Edit CircularGallery.4: replace

````tsx
      dpr: Math.min(window.devicePixelRatio || 1, 2)
````

with

````tsx
      dpr: cappedDpr(window.devicePixelRatio)
````

Edit CircularGallery.5: replace

````tsx
  update() {
    this.scroll.current = lerp(
````

with

````tsx
  update() {
    if (this.paused) {
      this.raf = window.requestAnimationFrame(this.update.bind(this));
      return;
    }
    this.scroll.current = lerp(
````

Edit CircularGallery.6: replace

````tsx
    window.addEventListener('resize', this.boundOnResize);
    window.addEventListener('mousewheel', this.boundOnWheel);
    window.addEventListener('wheel', this.boundOnWheel);
    window.addEventListener('mousedown', this.boundOnTouchDown);
    window.addEventListener('mousemove', this.boundOnTouchMove);
    window.addEventListener('mouseup', this.boundOnTouchUp);
    window.addEventListener('touchstart', this.boundOnTouchDown);
    window.addEventListener('touchmove', this.boundOnTouchMove);
    window.addEventListener('touchend', this.boundOnTouchUp);
````

with

````tsx
    // no wheel capture (the page must scroll normally); drags start on the gallery itself
    window.addEventListener('resize', this.boundOnResize);
    this.container.addEventListener('mousedown', this.boundOnTouchDown);
    window.addEventListener('mousemove', this.boundOnTouchMove);
    window.addEventListener('mouseup', this.boundOnTouchUp);
    this.container.addEventListener('touchstart', this.boundOnTouchDown, { passive: true });
    window.addEventListener('touchmove', this.boundOnTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundOnTouchUp);
````

Edit CircularGallery.7: replace

````tsx
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('mousewheel', this.boundOnWheel);
    window.removeEventListener('wheel', this.boundOnWheel);
    window.removeEventListener('mousedown', this.boundOnTouchDown);
    window.removeEventListener('mousemove', this.boundOnTouchMove);
    window.removeEventListener('mouseup', this.boundOnTouchUp);
    window.removeEventListener('touchstart', this.boundOnTouchDown);
    window.removeEventListener('touchmove', this.boundOnTouchMove);
    window.removeEventListener('touchend', this.boundOnTouchUp);
````

with

````tsx
    window.removeEventListener('resize', this.boundOnResize);
    this.container.removeEventListener('mousedown', this.boundOnTouchDown);
    window.removeEventListener('mousemove', this.boundOnTouchMove);
    window.removeEventListener('mouseup', this.boundOnTouchUp);
    this.container.removeEventListener('touchstart', this.boundOnTouchDown);
    window.removeEventListener('touchmove', this.boundOnTouchMove);
    window.removeEventListener('touchend', this.boundOnTouchUp);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
````

Edit CircularGallery.8: replace

````tsx
  scrollEase?: number;
}

export default function CircularGallery({
````

with

````tsx
  scrollEase?: number;
  paused?: boolean; // stop drawing while off screen
}

export default function CircularGallery({
````

Edit CircularGallery.9: replace

````tsx
  scrollEase = 0.05
}: CircularGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
````

with

````tsx
  scrollEase = 0.05,
  paused = false
}: CircularGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<App | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (appRef.current) appRef.current.paused = paused;
  }, [paused]);
  useEffect(() => {
````

Edit CircularGallery.10: replace

````tsx
        scrollSpeed,
        scrollEase
      });
    });
    return () => {
      isMounted = false;
      if (app) app.destroy();
    };
````

with

````tsx
        scrollSpeed,
        scrollEase
      });
      app.paused = pausedRef.current;
      appRef.current = app;
    });
    return () => {
      isMounted = false;
      appRef.current = null;
      if (app) app.destroy();
    };
````

Edit CircularGallery.11: replace

````tsx
aria-label="Circular image gallery. Use Left and Right Arrow keys to navigate."
````

with

````tsx
aria-label="Costume gallery. Drag it, or use the Left and Right Arrow keys, to spin it."
````

- [ ] **Step 2: Create** `apps/web/components/home/CostumeGallery.tsx`:

````tsx
"use client";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { SectionHeading } from "@/components/fx/SectionHeading";
import { GALLERY_ITEMS, SHOWCASE } from "@/lib/showcase";
import { useFx, useVisibility } from "@/lib/use-fx";

// A plain row of the costumes: the fallback (no WebGL, reduced motion) and what shows while the 3D gallery loads.
function StaticRack() {
  return (
    <ul className="flex h-full snap-x snap-mandatory items-center gap-4 overflow-x-auto px-4">
      {SHOWCASE.slice(1).map((c) => (
        <li key={c.slug} className="grid shrink-0 snap-center justify-items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.src} alt={`The mascot as a ${c.label}`} width={240} height={240} loading="lazy" className="h-60 w-60 rounded-3xl border border-line object-cover" />
          <span className="font-bold"><span aria-hidden>{c.emoji}</span> {c.label}</span>
        </li>
      ))}
    </ul>
  );
}

const CircularGallery = dynamic(() => import("@/components/bits/CircularGallery"), { ssr: false, loading: StaticRack });

// The 7 costumed mascots on a draggable 3D ring. Loads when first scrolled near; stops drawing off screen.
export function CostumeGallery() {
  const fx = useFx();
  const ref = useRef<HTMLDivElement>(null);
  const { active, seen } = useVisibility(ref, "300px");
  const font = fx.galleryWebGL ? `bold 30px ${getComputedStyle(document.body).fontFamily}` : "";
  return (
    <section aria-label="Costume gallery" className="grid gap-4">
      <SectionHeading>The costume wardrobe</SectionHeading>
      <p className="text-muted">Seven costumes, one mascot. Drag to spin the rack.</p>
      <div ref={ref} className="full-bleed relative h-[420px] sm:h-[520px]">
        {fx.galleryWebGL && seen ? (
          <FxBoundary fallback={<StaticRack />}>
            <CircularGallery items={GALLERY_ITEMS} bend={2} textColor="#f4f1ea" borderRadius={0.06} font={font} scrollSpeed={2} scrollEase={0.06} paused={!active} />
          </FxBoundary>
        ) : (
          <StaticRack />
        )}
      </div>
    </section>
  );
}
````

- [ ] **Step 3: Use it** — in `apps/web/app/page.tsx` add `import { CostumeGallery } from "@/components/home/CostumeGallery";` after the `Reveal` import, and replace

````tsx
      <HowItWorks />
      <Graveyard />
````

with

````tsx
      <HowItWorks />
      <Reveal><CostumeGallery /></Reveal>
      <Graveyard />
````

- [ ] **Step 4: Typecheck, lint, test, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npx vitest run apps/web/test && npm run build
```

Expected: all succeed.

- [ ] **Step 5: Quick look**: scrolling to "The costume wardrobe" shows a curved ring of the 7 costumed mascots with "👻 Ghost sheet"-style labels in Space Grotesk; dragging (mouse or touch) spins it and it snaps to a card; the mouse wheel scrolls the page, not the ring; arrow keys spin it when it has focus.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/bits/CircularGallery.tsx apps/web/components/home/CostumeGallery.tsx apps/web/app/page.tsx
git commit -F - <<'EOF'
feat(web): draggable 3D costume gallery of the seven costumed mascots

CircularGallery (React Bits, ogl) loads when scrolled near and pauses off screen;
a static row of images is the fallback.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Graveyard cards (TiltedCard + SpotlightCard, peek at the original)

**Files:**
- Create: `apps/web/components/bits/TiltedCard.tsx`, `apps/web/components/bits/SpotlightCard.tsx`
- Modify: `apps/web/components/CoinCard.tsx`, `apps/web/components/Graveyard.tsx`, `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `GraveCoin` (has `original_path` and `result_path`; `v_graveyard` exposes both), `artUrl`, `formatUsd`, `timeAgo` (existing); `usePointerFine`, `useReducedMotion` (Task 1); `SectionHeading`, `Reveal` (Task 6); `.peek-in` (Task 4).
- Produces:
  - `bits/TiltedCard.tsx`: default export `TiltedCard({ children: ReactNode; className?: string; scaleOnHover?: number; rotateAmplitude?: number; disabled?: boolean })`.
  - `bits/SpotlightCard.tsx`: default export `SpotlightCard` (upstream props: `spotlightColor`, `intensity`, `borderGlow`, `proximity`, `ambient`, `className`, … plus any `div` attribute); named export type `SpotlightCardProps`. Used again by Task 10.
  - `CoinCard({ coin, cap, emoji, touch?, still? })` — `coin`, `cap`, `emoji` unchanged; new optional `touch` (tap-to-peek layout) and `still` (no tilt).

Graveyard data loading, sorting, the 60 s list refresh and the 15 s market-cap reads are not touched. Pass `proximity={0}` to every Graveyard SpotlightCard: with the default (80) each of up to 60 cards would wake an animation frame on every mouse move anywhere on the page.

- [ ] **Step 1: TiltedCard** — upstream tilts a single image with a tooltip and a mobile warning; SpookPad tilts a whole card, so it uses an adapted version. Read the upstream for reference (`curl -fsSL https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/TiltedCard/TiltedCard.tsx`), then create `apps/web/components/bits/TiltedCard.tsx`:

````tsx
'use client';
// Adapted from React Bits (https://reactbits.dev) — TiltedCard, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/TiltedCard/TiltedCard.tsx
// SpookPad changes: tilts any children (a whole coin card) instead of one image; no tooltip, caption or mobile
// warning; `disabled` renders the children still (touch devices and reduced motion).
import type { SpringOptions } from 'motion/react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useRef, type MouseEvent, type ReactNode } from 'react';

const springValues: SpringOptions = {
  damping: 30,
  stiffness: 100,
  mass: 2
};

interface TiltedCardProps {
  children: ReactNode;
  className?: string;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  disabled?: boolean;
}

export default function TiltedCard({
  children,
  className = '',
  scaleOnHover = 1.04,
  rotateAmplitude = 10,
  disabled = false
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  if (disabled) return <div className={className}>{children}</div>;

  function handleMouse(e: MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
  }

  function handleMouseLeave() {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div
      ref={ref}
      className={`[perspective:800px] ${className}`}
      onMouseMove={handleMouse}
      onMouseEnter={() => scale.set(scaleOnHover)}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className="h-full [transform-style:preserve-3d]" style={{ rotateX, rotateY, scale }}>
        {children}
      </motion.div>
    </div>
  );
}
````

- [ ] **Step 2: SpotlightCard** — download:

````bash
curl -fsSL -o apps/web/components/bits/SpotlightCard.tsx https://raw.githubusercontent.com/DavidHDev/react-bits/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/SpotlightCard/SpotlightCard.tsx
sha256sum apps/web/components/bits/SpotlightCard.tsx | cut -c1-16   # expect f7b64189ce3c018e
````

Apply:

Edit SpotlightCard.1 (attribution): replace the first line `'use client';` with:

````tsx
'use client';
// From React Bits (https://reactbits.dev) — SpotlightCard, TS + Tailwind variant, MIT + Commons Clause license.
// Source: https://github.com/DavidHDev/react-bits/blob/b2098591ad5b3489eff65ca9e5b9f9bdf2de29c3/src/ts-tailwind/Components/SpotlightCard/SpotlightCard.tsx
// SpookPad changes: dark theme uses SpookPad's night-2 / line tokens; radius and padding come from className.
````

Edit SpotlightCard.2: replace

````tsx
  dark: {
    surface: '#111111',
    border: 'rgba(255, 255, 255, 0.08)',
````

with

````tsx
  dark: {
    surface: 'var(--color-night-2)',
    border: 'var(--color-line)',
````

Edit SpotlightCard.3: replace

````tsx
const CARD =
  'relative isolate overflow-hidden rounded-3xl p-8 [background-color:var(--spotlight-card-surface)] [box-shadow:var(--spotlight-card-shadow)]';
````

with

````tsx
const CARD =
  'relative isolate overflow-hidden [background-color:var(--spotlight-card-surface)] [box-shadow:var(--spotlight-card-shadow)]';
````

- [ ] **Step 3: Replace `apps/web/components/CoinCard.tsx`** with (the name, ticker, `MC {formatUsd(cap)}` and `timeAgo` row are exactly as before):

````tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { artUrl } from "@/lib/art";
import { formatUsd, timeAgo } from "@/lib/format";
import type { GraveCoin } from "@/lib/graveyard";
import SpotlightCard from "./bits/SpotlightCard";
import TiltedCard from "./bits/TiltedCard";

// A Graveyard coin: tilts and glows under the mouse; hovering (tapping the picture on touch) peeks at the original
// image. The original loads only when first peeked at. Data and market cap are shown exactly as before.
export function CoinCard({ coin, cap, emoji, touch = false, still = false }: {
  coin: GraveCoin; cap: number | undefined; emoji?: string; touch?: boolean; still?: boolean;
}) {
  const [peek, setPeek] = useState(false);
  const href = `/coin/?mint=${coin.mint}`;
  const art = (
    <div className="relative aspect-square bg-night">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={artUrl(coin.result_path) ?? ""} alt={`${coin.name} in costume`} loading="lazy" className="h-full w-full object-cover" />
      {peek && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artUrl(coin.original_path) ?? ""} alt={`${coin.name} without its costume`} className="peek-in absolute inset-0 h-full w-full object-cover" />
      )}
      {emoji && <span aria-hidden className="absolute right-2 top-2 rounded-full bg-night/80 px-2 py-1 text-lg">{emoji}</span>}
      {touch && (
        <span aria-hidden className="absolute bottom-2 left-2 rounded-full bg-night/80 px-2 py-0.5 text-xs">{peek ? "Costume" : "Tap to peek"}</span>
      )}
    </div>
  );
  const info = (
    <div className="grid gap-1 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-bold">{coin.name}</span>
        <span className="font-mono text-sm text-pumpkin">${coin.ticker}</span>
      </div>
      <div className="flex justify-between text-sm text-muted">
        <span>MC {formatUsd(cap)}</span>
        <span>{timeAgo(coin.launched_at)}</span>
      </div>
    </div>
  );
  return (
    <TiltedCard disabled={touch || still} className="h-full">
      <SpotlightCard spotlightColor="#ff7a1a" proximity={0} intensity={0.22} borderGlow={0.9} className="h-full rounded-[1.25rem]">
        {touch ? (
          <>
            <button type="button" aria-pressed={peek} aria-label={`Peek under ${coin.name}'s costume`} onClick={() => setPeek((p) => !p)} className="block w-full">
              {art}
            </button>
            <Link href={href} className="block">{info}</Link>
          </>
        ) : (
          <Link href={href} className="block" onMouseEnter={() => setPeek(true)} onMouseLeave={() => setPeek(false)} onFocus={() => setPeek(true)} onBlur={() => setPeek(false)}>
            {art}
            {info}
          </Link>
        )}
      </SpotlightCard>
    </TiltedCard>
  );
}
````

- [ ] **Step 4: Update `apps/web/components/Graveyard.tsx`** (presentation only). Replace

````tsx
import { fetchCostumes, type Costume } from "@/lib/public-data";
import { CoinCard } from "./CoinCard";
````

with

````tsx
import { fetchCostumes, type Costume } from "@/lib/public-data";
import { usePointerFine, useReducedMotion } from "@/lib/use-fx";
import { CoinCard } from "./CoinCard";
import { SectionHeading } from "./fx/SectionHeading";
````

replace

````tsx
  const [error, setError] = useState<string | null>(null);

````

with

````tsx
  const [error, setError] = useState<string | null>(null);
  const pointerFine = usePointerFine();
  const still = useReducedMotion();

````

replace

````tsx
        <h2 className="font-display text-4xl">The Graveyard</h2>
````

with

````tsx
        <SectionHeading>The Graveyard</SectionHeading>
````

and replace

````tsx
        {sorted.map((c) => <CoinCard key={c.mint} coin={c} cap={caps[c.mint]} emoji={emoji(c.costume)} />)}
````

with

````tsx
        {sorted.map((c) => <CoinCard key={c.mint} coin={c} cap={caps[c.mint]} emoji={emoji(c.costume)} touch={!pointerFine} still={still} />)}
````

- [ ] **Step 5: Final home page** — replace `apps/web/app/page.tsx` with:

````tsx
import { Graveyard } from "@/components/Graveyard";
import { Reveal } from "@/components/fx/Reveal";
import { CostumeGallery } from "@/components/home/CostumeGallery";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { StatsTicker } from "@/components/home/StatsTicker";

export default function Home() {
  return (
    <div className="grid gap-24">
      <Hero />
      <Reveal><StatsTicker /></Reveal>
      <HowItWorks />
      <Reveal><CostumeGallery /></Reveal>
      <Reveal><Graveyard /></Reveal>
    </div>
  );
}
````

- [ ] **Step 6: Typecheck, lint, test, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npx vitest run apps/web/test && npm run build
```

Expected: all succeed.

- [ ] **Step 7: Quick look**: with a mouse, a Graveyard card tilts toward the pointer, a pumpkin glow follows it, and the original (un-costumed) image fades in while hovering; clicking opens `/coin/?mint=…`; market caps still update (LIVE numbers change within ~15 s). In DevTools device mode (touch, 375 px): no tilt; tapping the picture toggles the original ("Tap to peek" / "Costume" badge); tapping the name row opens the coin page.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/bits/TiltedCard.tsx apps/web/components/bits/SpotlightCard.tsx apps/web/components/CoinCard.tsx apps/web/components/Graveyard.tsx apps/web/app/page.tsx
git commit -F - <<'EOF'
feat(web): tilting, glowing Graveyard cards that peek at the original image

TiltedCard + SpotlightCard (React Bits); hover (or tap the picture on touch) shows the
original. Data and live market caps unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Launch page polish (zero logic changes)

**Files:**
- Create: `apps/web/lib/brew.ts`, `apps/web/test/brew.test.ts`, `apps/web/components/Cauldron.tsx`
- Modify: `apps/web/components/CostumePicker.tsx`, `apps/web/components/GenerationCard.tsx`, `apps/web/components/RevealSlider.tsx`, `apps/web/components/LaunchWizard.tsx` (wrapper tags + one decorative element only)

**Interfaces:**
- Consumes: `SpotlightCard` (Task 9); `Reveal` (Task 6); `.cauldron-*`, `.dissolve-in`, `.reveal-range` CSS (Task 4); LaunchWizard's existing `SUMMON_TEXT` constant and `status`/`error` state (read only).
- Produces: `lib/brew.ts`: `BREW_EVERY_MS = 2500`; `BREW_LINES: readonly string[]` (6 lines); `brewLine(tick: number): string`. `Cauldron({ compact?: boolean })` (decorative, `aria-hidden`). `CostumePicker`, `GenerationCard`, `RevealSlider` keep their exact props.

Zero-logic rule for this task: in `LaunchWizard.tsx` the only allowed changes are the two import lines, the three `<Reveal>` wrappers and the status bar's class + decorative `<Cauldron compact />` shown below. `git diff apps/web/components/LaunchWizard.tsx` must show nothing else. `GenerationCard`'s stuck-timer effect and buttons are untouched; `RevealSlider`'s state and range input are untouched.

- [ ] **Step 1: Write the failing test** — `apps/web/test/brew.test.ts`:

````ts
import { expect, test } from "vitest";
import { BREW_LINES, brewLine } from "../lib/brew";

test("status lines rotate in order and loop", () => {
  expect(brewLine(0)).toBe(BREW_LINES[0]);
  expect(brewLine(1)).toBe(BREW_LINES[1]);
  expect(brewLine(BREW_LINES.length)).toBe(BREW_LINES[0]);
  expect(brewLine(-1)).toBe(BREW_LINES[BREW_LINES.length - 1]);
  expect(new Set(BREW_LINES).size).toBe(BREW_LINES.length);
});
````

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run apps/web/test/brew.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/brew"`.

- [ ] **Step 3: Implement** `apps/web/lib/brew.ts`:

````ts
// The spooky status lines that rotate under the cauldron while the AI works.
export const BREW_EVERY_MS = 2500;
export const BREW_LINES = [
  "Stirring the cauldron…",
  "Adding a pinch of moonlight…",
  "Stitching the costume…",
  "Asking the bats for a second opinion…",
  "Letting the potion bubble…",
  "Almost ready to haunt…",
] as const;

export const brewLine = (tick: number): string => {
  const n = BREW_LINES.length;
  return BREW_LINES[((Math.floor(tick) % n) + n) % n];
};
````

- [ ] **Step 4: Run the test**

Run: `npx vitest run apps/web/test/brew.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Create** `apps/web/components/Cauldron.tsx`:

````tsx
"use client";
import { useEffect, useState } from "react";
import { BREW_EVERY_MS, brewLine } from "@/lib/brew";

// A bubbling cauldron (SVG + CSS, globals.css .cauldron-*) with rotating spooky lines, shown while the AI works.
// Decorative: the text that matters ("Brewing…", the status bar) is next to it, so it is aria-hidden.
export function Cauldron({ compact = false }: { compact?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), BREW_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <span aria-hidden className="grid justify-items-center gap-1 text-center">
      <svg viewBox="0 0 120 100" className={compact ? "h-12 w-14" : "h-20 w-24"}>
        <g className="cauldron-bubbles" fill="#9be15d">
          <circle cx="45" cy="38" r="5" />
          <circle cx="62" cy="34" r="4" />
          <circle cx="75" cy="40" r="6" />
        </g>
        <ellipse cx="60" cy="44" rx="40" ry="8" fill="#9be15d" opacity=".85" />
        <path d="M18 46 Q18 92 60 92 Q102 92 102 46 Z" fill="#171124" stroke="#2c2340" strokeWidth="3" />
        <rect x="14" y="40" width="92" height="8" rx="4" fill="#2c2340" />
        <g className="cauldron-fire" fill="#ff7a1a">
          <path d="M44 99 q6 -12 12 0 z" />
          <path d="M58 99 q6 -15 12 0 z" />
          <path d="M72 99 q5 -10 10 0 z" />
        </g>
      </svg>
      <span className="text-xs font-semibold">{brewLine(tick)}</span>
    </span>
  );
}
````

- [ ] **Step 6: Replace `apps/web/components/CostumePicker.tsx`** with (same props, same radiogroup/radio semantics; `outline` and `drop-shadow` are used because SpotlightCard owns `box-shadow`):

````tsx
"use client";
import type { Costume } from "@/lib/public-data";
import SpotlightCard from "./bits/SpotlightCard";

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
            className={`rounded-[1.25rem] transition-transform duration-200 motion-safe:hover:-translate-y-1 ${
              on ? "outline-2 outline-pumpkin drop-shadow-[0_0_14px_#ff7a1a88]" : ""
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(c.slug)}
              className="flex w-full flex-col items-center gap-1 px-3 py-4 disabled:opacity-60"
            >
              <span aria-hidden className="text-4xl">{c.emoji}</span>
              <span className="text-sm font-semibold">{c.label}</span>
            </button>
          </SpotlightCard>
        );
      })}
    </div>
  );
}
````

- [ ] **Step 7: GenerationCard** — in `apps/web/components/GenerationCard.tsx` replace

````tsx
import { msUntilRetryable, type Generation } from "@/lib/summon";
````

with

````tsx
import { msUntilRetryable, type Generation } from "@/lib/summon";
import { Cauldron } from "./Cauldron";
````

replace

````tsx
className={`h-full w-full object-cover ${g.result_path ? "" : "opacity-40 grayscale"}`}
````

with

````tsx
className={`h-full w-full object-cover ${g.result_path ? "dissolve-in" : "opacity-40 grayscale"}`}
````

and replace

````tsx
(stuck ? "The spell got stuck" : "Brewing…")
````

with

````tsx
(stuck ? "The spell got stuck" : <><Cauldron compact /><span className="sr-only">Brewing…</span></>)
````

- [ ] **Step 8: Replace `apps/web/components/RevealSlider.tsx`** with:

````tsx
"use client";
import { useState } from "react";

// The costume over the original: drag to peek under the costume. Same props and behaviour; restyled with a pumpkin
// divider and handle that follow the slider, and corner labels.
export function RevealSlider({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(100);
  return (
    <div className="grid gap-2">
      <div className="card relative aspect-square overflow-hidden shadow-[0_0_40px_#ff7a1a22]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt} without its costume`} className="absolute inset-0 h-full w-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={`${alt} in costume`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-pumpkin shadow-[0_0_12px_#ff7a1a]" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-pumpkin text-sm font-bold text-night">⇆</span>
        </div>
        <span aria-hidden className="absolute left-3 top-3 rounded-full bg-night/80 px-2 py-0.5 text-xs">Costume</span>
        <span aria-hidden className="absolute right-3 top-3 rounded-full bg-night/80 px-2 py-0.5 text-xs">Original</span>
      </div>
      <label className="label">
        Peek under the costume
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="reveal-range" />
      </label>
    </div>
  );
}
````

- [ ] **Step 9: LaunchWizard wrappers** — in `apps/web/components/LaunchWizard.tsx` replace

````tsx
import { CostumePicker } from "./CostumePicker";
````

with

````tsx
import { Cauldron } from "./Cauldron";
import { CostumePicker } from "./CostumePicker";
import { Reveal } from "./fx/Reveal";
````

Wrap each of the three panel `<section className="card grid gap-4 p-5">` elements (headings "1. Your coin", "2. Pick a costume", "3. Launch on pump.fun") in a `Reveal`, without re-indenting anything inside: put `<Reveal>` on its own line directly above the first panel's `<section …>` and `</Reveal>` directly below its `</section>`; the same with `<Reveal delay={0.08}>` for panel 2 and `<Reveal delay={0.16}>` for panel 3. Panel 1 then reads:

````tsx
      <Reveal>
      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-bold">1. Your coin</h2>
        …unchanged…
        <p className="text-xs text-muted">No real people, real brands or trademarks, and nothing targeting private individuals.</p>
      </section>
      </Reveal>
````

Finally replace

````tsx
        <div role="status" aria-live="polite" className={`card sticky bottom-4 p-4 ${error ? "border-blood text-blood" : ""}`}>
          {error ?? status}
````

with

````tsx
        <div role="status" aria-live="polite" className={`card sticky bottom-4 flex items-center gap-3 p-4 ${error ? "border-blood text-blood" : ""}`}>
          {!error && status === SUMMON_TEXT.brewing && <Cauldron compact />}
          {error ?? status}
````

Verify: `git diff --stat apps/web/components/LaunchWizard.tsx` reports `11 ++++++++++-` (10 insertions, 1 deletion), and `git diff apps/web/components/LaunchWizard.tsx` shows only import lines, `<Reveal…>`/`</Reveal>` lines and the status-bar lines.

- [ ] **Step 10: Typecheck, lint, all tests, build**

```bash
npm run typecheck && (cd apps/web && npx eslint) && npm test && npm run build
```

Expected: all succeed (the existing LaunchWizard-related tests in `apps/web/test` — summon, launch-coin, fee-tx, draft — pass unchanged).

- [ ] **Step 11: Quick look** at `/launch/` (sign in with a wallet): the three panels slide in one after another; costume tiles lift on hover and the selected one has a pumpkin outline and glow; while a summon brews, the status bar shows a small bubbling cauldron next to "Brewing the costume…" and a generating card shows the cauldron with rotating lines; a finished costume fades in from a blur; on a coin page the slider has a pumpkin divider with a ⇆ handle following the range input.

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/brew.ts apps/web/test/brew.test.ts apps/web/components/Cauldron.tsx apps/web/components/CostumePicker.tsx apps/web/components/GenerationCard.tsx apps/web/components/RevealSlider.tsx apps/web/components/LaunchWizard.tsx
git commit -F - <<'EOF'
feat(web): Launch page polish: spotlight costume tiles, bubbling cauldron, panel entrances

Presentation only: no change to any logic, props or calls in LaunchWizard, summon,
launch-coin, pending or fee-tx. RevealSlider restyled.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Verification (tests, build, bundle, browser, Lighthouse)

**Files:**
- Create: `apps/web/scripts/check-initial-js.mjs`

**Interfaces:**
- Consumes: everything above; the built `apps/web/out/`.
- Produces: `node apps/web/scripts/check-initial-js.mjs` — exits 1 if three.js (`WebGLRenderer`) or ogl (`unable to create webgl context`) is in any script the exported home page references, or if either marker is missing from all chunks.

- [ ] **Step 1: Create** `apps/web/scripts/check-initial-js.mjs`:

````js
// Fails when three.js or ogl is in the home page's initial JavaScript: both must load lazily (next/dynamic,
// ssr: false). Run after a build: node apps/web/scripts/check-initial-js.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve(import.meta.dirname, "..", "out");
const MARKERS = { three: "WebGLRenderer", ogl: "unable to create webgl context" }; // strings minifiers keep

// every script the exported home page references (script tags, preloads and the inline RSC payload)
const html = readFileSync(path.join(out, "index.html"), "utf8");
const initial = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s\\]+?\.js/g)].map((m) => m[0]))];
if (!initial.length) throw new Error("No scripts found in out/index.html: build first.");

const all = readdirSync(path.join(out, "_next", "static", "chunks"), { recursive: true })
  .filter((f) => String(f).endsWith(".js"))
  .map((f) => `/_next/static/chunks/${String(f).replaceAll("\\", "/")}`);
const has = (file, marker) => readFileSync(path.join(out, file), "utf8").includes(marker);

let failed = false;
for (const [lib, marker] of Object.entries(MARKERS)) {
  const lazy = all.filter((f) => has(f, marker));
  const eager = initial.filter((f) => has(f, marker));
  console.log(`${lib}: in ${lazy.length} chunk(s) overall, ${eager.length} of them in the home page's initial JS`);
  if (!lazy.length) { console.error(`  ${lib} wasn't found at all: is the marker still right?`); failed = true; }
  for (const f of eager) { console.error(`  initial: ${f}`); failed = true; }
}
console.log(`checked ${initial.length} initial script(s)`);
process.exit(failed ? 1 : 0);
````

- [ ] **Step 2: Full automated checks**

```bash
npm test
npm run typecheck
(cd apps/web && npx eslint)
npm run build
node apps/web/scripts/check-initial-js.mjs
```

Expected: tests all pass (the 5 new web test files, `scripts/test/showcase-art.test.ts` and `supabase/tests/stats.test.ts` included; live-AI tests stay skipped); typecheck and lint clean; build prints the route table; the bundle check prints `three: in 1 chunk(s) overall, 0 of them in the home page's initial JS` and `ogl: in 1 chunk(s) overall, 0 of them …` (chunk counts may differ; the "0 of them" part must not) and exits 0.

- [ ] **Step 3: Confirm untouched logic**

```bash
git diff master --stat -- apps/web/lib/summon.ts apps/web/lib/launch-coin.ts apps/web/lib/pending.ts apps/web/lib/fee-tx.ts packages supabase/migrations/0001_spookpad.sql
```

Expected: no output. And `git diff master -- apps/web/components/LaunchWizard.tsx` shows only the lines listed in Task 10 Step 9.

- [ ] **Step 4: Manual browser checklist** (serve the build: `npx serve@14.2.6 apps/web/out -l 4173`, Chrome). Record each item as pass/fail in the report to the controller.

Desktop 1280×800, mouse:
1. Hero fills the screen; fog and embers move; title letters rise in once; the mascot changes costume every ~3 s with the caption; no layout jump when images swap.
2. Header transparent at the top; frosted with a smaller logo after scrolling; the page doesn't move when it changes.
3. Click sparks (orange) on every click; faint ghost trail follows the mouse and fades when it stops/leaves.
4. Counters count up once; ticker drifts and reacts to scroll speed (or is absent with no coins).
5. How it works cards stack while scrolling and release cleanly; the page scroll is native (no smoothing lag).
6. Gallery drags/spins, wheel scrolls the page; headings float in.
7. Graveyard cards tilt + glow + peek at the original; market caps still update; sort buttons work.
8. Switch to another tab for 10 s and back: the hero resumes where it was (no burst of queued swaps); DevTools Performance shows no hero/gallery animation frames while hidden.
9. `/launch/` and `/coin/?mint=<a real mint>` behave as before (sign in, summon, retry, launch buttons all present and enabled/disabled exactly as before).

375 px (DevTools device toolbar, iPhone-size, touch):
10. No horizontal scrollbar on any page; header fits on one line when signed out.
11. Hero background is the CSS gradient (DevTools Elements: no `<canvas>` inside the hero); no ghost cursor canvas; the mascot box keeps its size.
12. Graveyard: tap picture toggles original; tap name row opens the coin.

Reduced motion (DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce", then reload):
13. Hero shows the ghost costume, still; the title is plain text; no fog/embers canvases; no sparks; no ghost trail.
14. Counters show final numbers immediately; ticker is a still line; How it works is a plain 3-card list; gallery is the static row; headings are plain; anchor links jump without smooth scrolling; the cauldron doesn't bubble.

WebGL disabled (close Chrome, then start a separate profile: `"/c/Program Files/Google/Chrome/Application/chrome.exe" --disable-3d-apis --user-data-dir="$TEMP/spookpad-nogl" http://localhost:4173/`):
15. Hero shows the CSS gradient (no blank area), the gallery shows the static row, no ghost cursor; sparks and all other animations still work; the console shows no uncaught errors.

- [ ] **Step 5: Lighthouse (mobile) on the home page**

With the server from Step 4 still running:

```bash
npx --yes lighthouse@13.5.0 http://localhost:4173/ --preset=perf --form-factor=mobile --output=json --output-path=.data/lh-home.json --chrome-flags="--headless=new" --quiet
node -e "const r=require('./.data/lh-home.json');console.log('performance', Math.round(r.categories.performance.score*100), ['largest-contentful-paint','total-blocking-time','cumulative-layout-shift'].map(k=>k+'='+r.audits[k].displayValue).join(' '))"
```

Expected: `performance` ≥ 70 and CLS < 0.1. (A planning dry run with placeholder art scored 76: LCP 2.6 s, TBT 710 ms, CLS 0.001.) Lighthouse may warn that it wants Node ≥ 22.19; it still runs on 22.15. If the score is below 70, report it with the three metrics to the controller instead of changing effects on your own.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/check-initial-js.mjs
git commit -F - <<'EOF'
chore(web): check that three.js and ogl stay out of the home page's initial JS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Hand back to the controller** with: the checklist results, the Lighthouse numbers, the bundle-check output and `git log --oneline master..redesign`. Do not push and do not merge. The controller then (separately, with the owner): runs `npx supabase db push` for migration 0002 if not done yet, and decides how `redesign` reaches `master` (e.g. a Netlify deploy preview of the pushed `redesign` branch first). Pushing or merging to `master` deploys the live site.
