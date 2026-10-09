# SpookPad Scroll Intro (Wardrobe Stage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scroll-driven 3D intro on the home page: the SpookPad mascot on a stage, its seven costumes turning on a
wardrobe ring, it picks one and hops into it, then the page carries on.

**Architecture:** A one-off script makes transparent cut-outs of the 8 showcase pictures. A pure timeline function
(`introFrame`) maps scroll progress to every value in the scene. A three.js scene, lazily loaded, draws the cut-outs
as thick "stickers". A tall section with a sticky stage feeds scroll progress to it. Today's hero stays as the server
render and as the fallback.

**Tech Stack:** Next.js 16 static export, React 19, three 0.180 (already installed), sharp (root devDependency),
vitest.

Spec: `docs/superpowers/specs/2026-10-09-spookpad-intro-stage-design.md`.

## Global Constraints

- No new dependencies (runtime or dev). three, gsap and sharp are already installed.
- three.js must stay out of the home page's initial JavaScript: `node apps/web/scripts/check-initial-js.mjs` passes
  after a build. Load the scene only with `next/dynamic(..., { ssr: false })`.
- Server render, first paint, reduced motion, no WebGL, and any scene error show today's hero exactly as it is now.
- Cut-outs: `apps/web/public/showcase/cut/<slug>.webp`, 512 x 512, transparent background, at most 120 KB each.
  The owner approves them before they are committed.
- Intro section: 350 svh tall, with a sticky 100 svh stage. A "Skip intro" link goes to `#stats`.
- Phones get the intro too: device pixel ratio 1 and 20 smoke sprites under 640 px; elsewhere `cappedDpr` and 40.
- The canvas is `aria-hidden`; the headline stays real text; the picked costume's name is in an `aria-live="polite"`
  element.
- No change to wallet, payments, launches, the Launch page or the other home sections.
- No emojis anywhere in the UI (the owner's rule).
- Code style: match the surrounding files (short comments explaining why, 2-space indent, double quotes, Tailwind
  classes, `@/` imports in apps/web).
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `scripts/cutout-lib.mjs` (new) | Pure flood-fill mask, content box, and `cutout()` (sharp) |
| `scripts/make-cutouts.mjs` (new) | One-off runner: showcase/*.webp to showcase/cut/*.webp |
| `scripts/test/cutout.test.ts` (new) | Tests for the above |
| `package.json` (root) | `cutouts` npm script |
| `apps/web/lib/intro.ts` (new) | `introFrame`, `progressAt`, `randomPick`, constants |
| `apps/web/test/intro.test.ts` (new) | Timeline tests |
| `apps/web/lib/fx.ts`, `apps/web/test/fx.test.ts` | New `intro3d` flag |
| `apps/web/lib/showcase.ts`, `apps/web/test/showcase.test.ts` | `cut` path on each showcase item |
| `apps/web/components/home/IntroScene.tsx` (new) | The three.js scene (default export, lazy) |
| `apps/web/components/home/IntroStage.tsx` (new) | Tall section, sticky stage, scroll progress, overlays |
| `apps/web/components/home/HeroCopy.tsx` (new) | Headline, subline and buttons (shared by both heroes) |
| `apps/web/components/home/Hero.tsx` | Chooses IntroStage or today's hero (`ClassicHero`) |
| `apps/web/app/globals.css` | `.intro-bleed` |

---

### Task 1: Cut-outs

**Files:**
- Create: `scripts/cutout-lib.mjs`, `scripts/make-cutouts.mjs`, `scripts/test/cutout.test.ts`
- Modify: `package.json` (root, `scripts` block)
- Generated (committed only after the owner approves): `apps/web/public/showcase/cut/*.webp`

**Interfaces:**
- Produces: `backgroundMask(rgba: Uint8Array|Buffer, width: number, height: number, tolerance?: number): Uint8Array`
  (1 = background), `contentBox(mask, width, height): { left, top, width, height }`,
  `cutout(bytes: Buffer, size?: number): Promise<Buffer>` (webp), constants `TOLERANCE = 40`, `CUT_SIZE = 512`,
  `MAX_CUT_BYTES = 120_000`. Files at `apps/web/public/showcase/cut/<slug>.webp`, used by Task 3.

- [ ] **Step 1: Write the failing tests** in `scripts/test/cutout.test.ts`:

```ts
import { expect, test } from "vitest";
import sharp from "sharp";
import { backgroundMask, contentBox, cutout, CUT_SIZE, MAX_CUT_BYTES } from "../cutout-lib.mjs";

const BG = [35, 24, 62];
const FG = [150, 230, 190];

// width x height, background colour everywhere, `paint` lists [x, y, rgb] pixels to change
function image(width: number, height: number, paint: [number, number, number[]][]): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) px.set([...BG, 255], i * 4);
  for (const [x, y, rgb] of paint) px.set([...rgb, 255], (y * width + x) * 4);
  return px;
}

// a 3x3 ring of character pixels at (1..3, 1..3) whose middle pixel has the background colour
const ring: [number, number, number[]][] = [];
for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) if (x !== 2 || y !== 2) ring.push([x, y, FG]);

test("the background is found from the edges", () => {
  const mask = backgroundMask(image(5, 5, ring), 5, 5);
  expect(mask[0]).toBe(1);
  expect(mask[4 * 5 + 4]).toBe(1);
  expect(mask[1 * 5 + 1]).toBe(0);
});

test("a background-coloured pixel inside the character is kept", () => {
  const mask = backgroundMask(image(5, 5, ring), 5, 5);
  expect(mask[2 * 5 + 2]).toBe(0);
});

test("colours close to the background (within the tolerance) count as background", () => {
  const near = [BG[0] + 10, BG[1] + 10, BG[2] + 10];
  const mask = backgroundMask(image(3, 1, [[1, 0, near]]), 3, 1);
  expect([...mask]).toEqual([1, 1, 1]);
});

test("the content box wraps the character", () => {
  const mask = backgroundMask(image(5, 5, ring), 5, 5);
  expect(contentBox(mask, 5, 5)).toEqual({ left: 1, top: 1, width: 3, height: 3 });
});

test("cutout makes a 512 square webp with a transparent background and the character standing on the bottom edge", async () => {
  const w = 40, h = 40;
  const paint: [number, number, number[]][] = [];
  for (let y = 10; y < 30; y++) for (let x = 15; x < 25; x++) paint.push([x, y, FG]);
  const png = await sharp(Buffer.from(image(w, h, paint)), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const out = await cutout(png);
  expect(out.length).toBeLessThanOrEqual(MAX_CUT_BYTES);
  const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([CUT_SIZE, CUT_SIZE]);
  const alpha = (x: number, y: number) => data[(y * CUT_SIZE + x) * 4 + 3];
  expect(alpha(0, 0)).toBe(0);
  expect(alpha(CUT_SIZE / 2, CUT_SIZE - 2)).toBeGreaterThan(200);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/test/cutout.test.ts` (from the repo root)
Expected: FAIL, "Failed to load ../cutout-lib.mjs" (the file does not exist).

- [ ] **Step 3: Write `scripts/cutout-lib.mjs`**

```js
// The scroll intro's cut-outs (spec 2026-10-09-spookpad-intro-stage-design.md): the showcase art's solid background
// made transparent by a flood fill from the image edges, so a background-coloured pixel inside the character stays.
import sharp from "sharp";

export const TOLERANCE = 40;      // colour distance from the corner pixel that still counts as background
export const CUT_SIZE = 512;
export const MAX_CUT_BYTES = 120_000;

// rgba: width * height * 4 bytes. Returns 1 for each background pixel, 0 for the character.
export function backgroundMask(rgba, width, height, tolerance = TOLERANCE) {
  const bg = [rgba[0], rgba[1], rgba[2]];
  const near = (i) => Math.hypot(rgba[i * 4] - bg[0], rgba[i * 4 + 1] - bg[1], rgba[i * 4 + 2] - bg[2]) < tolerance;
  const mask = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (!seen[i]) { seen[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    if (!near(i)) continue;
    mask[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return mask;
}

// The smallest rectangle holding every character pixel (mask 0).
export function contentBox(mask, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error("no character found: the whole picture matched the background");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Transparent background, trimmed to the character, then centred on a square with its feet on the bottom edge (the
// scene stands each cut-out on the floor at its bottom edge).
export async function cutout(bytes, size = CUT_SIZE) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = backgroundMask(data, info.width, info.height);
  for (let i = 0; i < mask.length; i++) if (mask[i]) data.fill(0, i * 4, i * 4 + 4);
  const box = contentBox(mask, info.width, info.height);
  const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box).png().toBuffer();
  for (const quality of [82, 72, 62]) {
    const out = await sharp(trimmed)
      .resize(size, size, { fit: "contain", position: "bottom", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality, alphaQuality: 90, effort: 5 })
      .toBuffer();
    if (out.length <= MAX_CUT_BYTES) return out;
  }
  throw new Error(`cut-out is over ${MAX_CUT_BYTES} bytes even at quality 62`);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run scripts/test/cutout.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `scripts/make-cutouts.mjs`**

```js
// Makes the scroll intro's cut-outs: apps/web/public/showcase/<slug>.webp -> apps/web/public/showcase/cut/<slug>.webp.
// Run once with `npm run cutouts`; the owner approves the results before they are committed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cutout } from "./cutout-lib.mjs";

const SRC = path.resolve(import.meta.dirname, "..", "apps", "web", "public", "showcase");
const OUT = path.join(SRC, "cut");
mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".webp"))) {
  const out = await cutout(readFileSync(path.join(SRC, file)));
  writeFileSync(path.join(OUT, file), out);
  console.log(`${file}: ${(out.length / 1024).toFixed(0)} KB`);
}
```

In the root `package.json` `scripts`, after `"showcase-art"`, add (with a comma after the `showcase-art` line):

```json
    "cutouts": "node scripts/make-cutouts.mjs"
```

- [ ] **Step 6: Make the cut-outs**

Run: `npm run cutouts` (repo root)
Expected: 8 lines, `devil.webp: NN KB` ... `witch.webp: NN KB`, each at most 117 KB.
Then `ls apps/web/public/showcase/cut` lists the 8 files.

- [ ] **Step 7: Commit the code (not the images: the owner approves those first)**

```bash
git add scripts/cutout-lib.mjs scripts/make-cutouts.mjs scripts/test/cutout.test.ts package.json
git commit -m "feat: cut-out script for the scroll intro (transparent showcase art)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Report the 8 file sizes. The controller shows the images to the owner and commits them after approval.

---

### Task 2: Timeline, fx flag, showcase paths

**Files:**
- Create: `apps/web/lib/intro.ts`, `apps/web/test/intro.test.ts`
- Modify: `apps/web/lib/fx.ts` (FxPlan and fxPlan), `apps/web/test/fx.test.ts`
- Modify: `apps/web/lib/showcase.ts` (ShowcaseItem and item), `apps/web/test/showcase.test.ts:6`

**Interfaces:**
- Produces (used by Task 3):
  - `RING_COUNT = 7`, `INTRO_SVH = 350`, `SWAP_AT = 0.75`, `MAX_YAW` (25 degrees in radians), `RING_STEP` (2 pi / 7)
  - `interface IntroFrame { textIn: number; textOut: number; camZ: number; ringRise: number; ringAngle: number; yaw: number; lean: number; hop: number; squash: number; smoke: number; pickedLeft: number; wearing: number }`
    (`wearing` is -1 for plain, else the ring index 0..6; ring item `i` stands at angle `ringAngle + i * RING_STEP`,
    and angle 0 is the front, nearest the camera)
  - `introFrame(progress: number, pick: number): IntroFrame`
  - `progressAt(top: number, height: number, viewport: number): number`
  - `randomPick(): number` (0..6)
  - `FxPlan.intro3d: boolean`
  - `ShowcaseItem.cut: string` (`/showcase/cut/<slug>.webp`); `SHOWCASE[0]` is plain and `SHOWCASE[i + 1]` is ring
    item `i`.

- [ ] **Step 1: Write the failing tests** in `apps/web/test/intro.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { introFrame, MAX_YAW, progressAt, randomPick, RING_COUNT, RING_STEP, SWAP_AT, type IntroFrame } from "../lib/intro";

const TAU = Math.PI * 2;
const frontOffset = (f: IntroFrame, i: number) => {
  const a = (((f.ringAngle + i * RING_STEP) % TAU) + TAU) % TAU;
  return Math.min(a, TAU - a); // distance from the front, in radians
};

describe("introFrame", () => {
  test("the opening text shows at the top and is gone from 0.15 to 0.85; the closing text shows at the end", () => {
    expect(introFrame(0, 3)).toMatchObject({ textIn: 1, textOut: 0 });
    for (const p of [0.15, 0.3, 0.5, 0.7, 0.85]) expect(introFrame(p, 3)).toMatchObject({ textIn: 0, textOut: 0 });
    expect(introFrame(1, 3).textOut).toBe(1);
  });

  test("the ring stops with the picked costume in front", () => {
    for (let pick = 0; pick < RING_COUNT; pick++) {
      expect(frontOffset(introFrame(0.7, pick), pick)).toBeLessThan(1e-9);
      expect(frontOffset(introFrame(1, pick), pick)).toBeLessThan(1e-9);
    }
  });

  test("the ring turns while scrolling from 0.3 to 0.7", () => {
    expect(introFrame(0.3, 2).ringAngle).not.toBeCloseTo(introFrame(0.7, 2).ringAngle, 3);
    expect(introFrame(0.5, 2).ringAngle).not.toBeCloseTo(introFrame(0.7, 2).ringAngle, 3);
  });

  test("the costumes rise between 0.15 and 0.3", () => {
    expect(introFrame(0.15, 0).ringRise).toBe(0);
    expect(introFrame(0.3, 0).ringRise).toBe(1);
  });

  test("the mascot wears plain before the swap and the pick from the swap on", () => {
    expect(introFrame(SWAP_AT - 0.001, 4).wearing).toBe(-1);
    expect(introFrame(SWAP_AT, 4).wearing).toBe(4);
    expect(introFrame(1, 4).wearing).toBe(4);
  });

  test("the smoke fully covers the mascot around the swap, and is gone before and after the hop", () => {
    for (const d of [-0.01, 0, 0.01]) expect(introFrame(SWAP_AT + d, 1).smoke).toBeGreaterThanOrEqual(0.99);
    expect(introFrame(0.7, 1).smoke).toBe(0);
    expect(introFrame(0.8, 1).smoke).toBe(0);
  });

  test("the mascot hops between 0.7 and 0.8 and squashes on landing", () => {
    expect(introFrame(0.7, 0).hop).toBeCloseTo(0, 9);
    expect(introFrame(0.75, 0).hop).toBeGreaterThan(0.5);
    expect(introFrame(0.8, 0).hop).toBeCloseTo(0, 9);
    expect(introFrame(0.825, 0).squash).toBeGreaterThan(0.1);
    expect(introFrame(0.85, 0).squash).toBeCloseTo(0, 9);
  });

  test("the mascot turns only while the ring turns, never past 25 degrees", () => {
    for (const p of [0, 0.1, 0.29, 0.7, 0.9, 1]) expect(Math.abs(introFrame(p, 5).yaw)).toBeLessThan(1e-9);
    for (let p = 0; p <= 1; p += 0.001) expect(Math.abs(introFrame(p, 5).yaw)).toBeLessThanOrEqual(MAX_YAW + 1e-12);
    expect(Math.max(...Array.from({ length: 400 }, (_, k) => Math.abs(introFrame(0.3 + k / 1000, 5).yaw)))).toBeGreaterThan(0.2);
  });

  test("every numeric value moves smoothly with the scroll (only the picture switches at once)", () => {
    const keys = ["textIn", "textOut", "camZ", "ringRise", "ringAngle", "yaw", "lean", "hop", "squash", "smoke", "pickedLeft"] as const;
    let prev = introFrame(0, 6);
    for (let k = 1; k <= 2000; k++) {
      const next = introFrame(k / 2000, 6);
      for (const key of keys) expect(Math.abs(next[key] - prev[key]), `${key} at ${k / 2000}`).toBeLessThan(0.08);
      prev = next;
    }
  });

  test("progress outside 0..1 (or not a number) is clamped", () => {
    expect(introFrame(-1, 2)).toEqual(introFrame(0, 2));
    expect(introFrame(2, 2)).toEqual(introFrame(1, 2));
    expect(introFrame(Number.NaN, 2)).toEqual(introFrame(0, 2));
  });

  test("a pick outside 0..6 wraps into range", () => {
    expect(introFrame(1, 9).wearing).toBe(2);
    expect(introFrame(1, -1).wearing).toBe(6);
  });
});

test("progressAt: 0 at the section's top, 1 when its bottom reaches the bottom of the screen", () => {
  expect(progressAt(0, 3500, 1000)).toBe(0);
  expect(progressAt(100, 3500, 1000)).toBe(0);
  expect(progressAt(-1250, 3500, 1000)).toBe(0.5);
  expect(progressAt(-5000, 3500, 1000)).toBe(1);
  expect(progressAt(-10, 800, 1000)).toBe(0);
});

test("randomPick is a ring index", () => {
  for (let k = 0; k < 50; k++) {
    const pick = randomPick();
    expect(Number.isInteger(pick) && pick >= 0 && pick < RING_COUNT).toBe(true);
  }
});
```

In `apps/web/test/fx.test.ts`, replace the `describe("fxPlan", ...)` block with:

```ts
describe("fxPlan", () => {
  test("a capable desktop gets every effect", () => {
    expect(fxPlan(desktop)).toEqual({ animate: true, heroWebGL: true, galleryWebGL: true, ghostCursor: true, sparks: true, intro3d: true });
  });
  test("reduced motion turns everything off", () => {
    expect(fxPlan({ ...desktop, reducedMotion: true })).toEqual({
      animate: false, heroWebGL: false, galleryWebGL: false, ghostCursor: false, sparks: false, intro3d: false,
    });
  });
  test("touch devices get no ghost cursor", () => {
    expect(fxPlan({ ...desktop, pointerFine: false })).toMatchObject({ ghostCursor: false, heroWebGL: true, sparks: true, intro3d: true });
  });
  test("below 640 px the hero background is the CSS gradient and there is no ghost cursor; the gallery and the intro stay", () => {
    expect(fxPlan({ ...desktop, wide: false })).toMatchObject({ heroWebGL: false, ghostCursor: false, galleryWebGL: true, intro3d: true });
  });
  test("no WebGL (or not checked yet) means static fallbacks, still animated", () => {
    for (const webgl of [false, null]) {
      expect(fxPlan({ ...desktop, webgl })).toEqual({ animate: true, heroWebGL: false, galleryWebGL: false, ghostCursor: false, sparks: true, intro3d: false });
    }
  });
  test("nothing heavy loads before the page is ready", () => {
    expect(fxPlan({ ...desktop, ready: false })).toEqual({ animate: true, heroWebGL: false, galleryWebGL: false, ghostCursor: false, sparks: false, intro3d: false });
  });
});
```

In `apps/web/test/showcase.test.ts` line 6, change the expectation to:

```ts
  expect(SHOWCASE[2]).toEqual({ slug: "witch", label: "Witch", src: "/showcase/witch.webp", cut: "/showcase/cut/witch.webp" });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run test/intro.test.ts test/fx.test.ts test/showcase.test.ts`
Expected: FAIL: intro.test.ts cannot load `../lib/intro`; fx tests miss `intro3d`; showcase misses `cut`.

- [ ] **Step 3: Write `apps/web/lib/intro.ts`**

```ts
// The scroll intro's timeline (spec 2026-10-09-spookpad-intro-stage-design.md). Pure: scroll progress in, every value
// the scene needs out, so scrolling back up plays it exactly in reverse.
export const RING_COUNT = 7;           // the seven costumes on the wardrobe ring
export const RING_STEP = (2 * Math.PI) / RING_COUNT;
export const INTRO_SVH = 350;          // the section's height; the stage inside it is sticky
export const SWAP_AT = 0.75;           // the top of the hop: the mascot's picture switches here, under full smoke
export const MAX_YAW = (25 * Math.PI) / 180;
const TURNS = 1.5;                     // ring turns between 0.3 and 0.7

export interface IntroFrame {
  textIn: number;     // opening text opacity
  textOut: number;    // closing text opacity
  camZ: number;       // camera distance from the mascot
  ringRise: number;   // 0: costumes below the floor, 1: on the ring
  ringAngle: number;  // ring item i stands at ringAngle + i * RING_STEP; angle 0 is the front (nearest the camera)
  yaw: number;        // mascot turn, radians, toward the costume nearest the front
  lean: number;       // mascot tilt, radians
  hop: number;        // mascot height above the floor
  squash: number;     // landing squash: scaleY = 1 - squash, scaleX = 1 + 0.6 * squash
  smoke: number;      // 0..1 smoke puff
  pickedLeft: number; // 0..1 how far the picked costume has left the ring
  wearing: number;    // -1 plain, else the ring index the mascot wears
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x); // smoothstep: no jolt where a phase starts or ends

export function introFrame(progress: number, pick: number): IntroFrame {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const k = ((Math.floor(pick) % RING_COUNT) + RING_COUNT) % RING_COUNT;
  const end = -k * RING_STEP; // puts item k at the front
  const ringAngle = end + TURNS * 2 * Math.PI * (1 - ease(seg(p, 0.3, 0.7)));
  // The items are 1/7 of a turn apart, so sin(7 * angle) is the same for all of them: it leans toward the item nearest
  // the front, passes through 0 halfway between two items, and is 0 when an item is exactly in front. At the ring's
  // start (end + 3 pi) and end angles that holds too, so the mascot is still before 0.3 and after 0.7.
  const yaw = MAX_YAW * Math.sin(RING_COUNT * ringAngle);
  return {
    textIn: 1 - ease(seg(p, 0, 0.15)),
    textOut: ease(seg(p, 0.85, 0.95)),
    camZ: 9 - 3 * ease(seg(p, 0, 0.3)),
    ringRise: ease(seg(p, 0.15, 0.3)),
    ringAngle,
    yaw,
    lean: -0.35 * yaw,
    hop: 0.9 * Math.sin(Math.PI * seg(p, 0.7, 0.8)),
    squash: 0.18 * Math.sin(Math.PI * seg(p, 0.8, 0.85)),
    smoke: clamp01((0.035 - Math.abs(p - SWAP_AT)) / 0.015), // full within 0.02 of the swap, gone 0.035 away
    pickedLeft: ease(seg(p, 0.72, SWAP_AT)),
    wearing: p >= SWAP_AT ? k : -1,
  };
}

// Scroll progress through the intro section from its bounding box: 0 while its top is at (or below) the top of the
// screen, 1 once its bottom reaches the bottom of the screen.
export function progressAt(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return 0;
  return clamp01(-top / travel);
}

export const randomPick = (): number => Math.floor(Math.random() * RING_COUNT) % RING_COUNT;
```

In `apps/web/lib/fx.ts`, add the field to `FxPlan` after `sparks`:

```ts
  intro3d: boolean;      // the 3D scroll intro (else today's hero); phones too, at a lower resolution
```

and in `fxPlan`'s returned object, after `sparks: animate && e.ready,`:

```ts
    intro3d: gl,
```

In `apps/web/lib/showcase.ts`, replace the `ShowcaseItem` interface and `item` helper with:

```ts
export interface ShowcaseItem { slug: string; label: string; src: string; cut: string }

// cut: the transparent cut-out the scroll intro stands on its stage (scripts/make-cutouts.mjs)
const item = (slug: string, label: string): ShowcaseItem => ({ slug, label, src: `/showcase/${slug}.webp`, cut: `/showcase/cut/${slug}.webp` });
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit`
Expected: every test passes; tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/intro.ts apps/web/test/intro.test.ts apps/web/lib/fx.ts apps/web/test/fx.test.ts apps/web/lib/showcase.ts apps/web/test/showcase.test.ts
git commit -m "feat(web): scroll intro timeline, intro3d fx flag, cut-out paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The stage and the scene

**Files:**
- Create: `apps/web/components/home/HeroCopy.tsx`, `apps/web/components/home/IntroScene.tsx`,
  `apps/web/components/home/IntroStage.tsx`
- Modify: `apps/web/components/home/Hero.tsx` (whole file), `apps/web/app/globals.css` (after `.hero-bleed`)

**Interfaces:**
- Consumes: everything Task 2 produces; the cut-outs from Task 1 (`SHOWCASE[i].cut`); `useFx`, `useWide`,
  `useVisibility` from `@/lib/use-fx`; `cappedDpr` from `@/lib/fx`; `FxBoundary`; `HeroBackground`; `CostumeMorph`.
- Produces: `Hero` (unchanged name and export, used by `app/page.tsx`).

This task has no unit tests: the timeline is tested in Task 2 and the scene is checked in the browser (Step 6).

- [ ] **Step 1: Extract the hero's text into `apps/web/components/home/HeroCopy.tsx`**

```tsx
"use client";
import Link from "next/link";
import SplitText from "@/components/bits/SplitText";

const TITLE = "Every coin wears a costume";
const TITLE_CLASS = "font-display text-5xl leading-[1.05] text-pumpkin sm:text-7xl";

// The hero's headline, subline and buttons: the same in today's hero and in the scroll intro.
export function HeroCopy({ animate }: { animate: boolean }) {
  return (
    <>
      {animate ? (
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
    </>
  );
}
```

- [ ] **Step 2: Replace `apps/web/components/home/Hero.tsx`**

```tsx
"use client";
import { useRef } from "react";
import { FxBoundary } from "@/components/fx/FxBoundary";
import { useFx, useVisibility } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";
import { HeroCopy } from "./HeroCopy";
import { IntroStage } from "./IntroStage";

// The opening: the 3D scroll intro when it may run, else (server render, first paint, reduced motion, no WebGL, or
// the scene failing) today's full-viewport hero.
export function Hero() {
  const fx = useFx();
  const classic = <ClassicHero />;
  return fx.intro3d ? <FxBoundary fallback={classic}><IntroStage /></FxBoundary> : classic;
}

// Full-viewport opening: what SpookPad does, in a few seconds.
function ClassicHero() {
  const fx = useFx();
  // Motion starts only once the page is ready (not from the plan alone), so reduced-motion users never see an animated first frame.
  const animate = fx.animate && fx.ready;
  const ref = useRef<HTMLElement>(null);
  const { active } = useVisibility(ref, "0px");
  return (
    <section ref={ref} aria-label="SpookPad" className="hero-bleed relative isolate grid min-h-[100svh] content-center overflow-hidden">
      <HeroBackground webgl={fx.heroWebGL} paused={!active} />
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 pb-16 pt-8 sm:py-12 sm:pb-16 md:grid-cols-[1.15fr_1fr] md:gap-10">
        <div className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
          <HeroCopy animate={animate} />
        </div>
        <CostumeMorph animate={animate} active={active} />
      </div>
      <a href="#stats" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-2xl text-muted motion-safe:animate-bounce">
        <span aria-hidden>↓</span>
        <span className="sr-only">Scroll down</span>
      </a>
    </section>
  );
}
```

- [ ] **Step 3: Add `.intro-bleed` to `apps/web/app/globals.css`, right after the `.hero-bleed { ... }` rule**

```css
/* the scroll intro: full width, and its top slides up under the sticky header and main's top padding like the hero;
   the sticky stage inside adds the header's height back as padding */
.intro-bleed {
  width: 100vw; margin-left: calc(50% - 50vw);
  margin-top: calc(-1 * (var(--header-h, 4.5rem) + 2rem));
}
```

- [ ] **Step 4: Write `apps/web/components/home/IntroScene.tsx`**

```tsx
"use client";
// The scroll intro's 3D stage (spec 2026-10-09-spookpad-intro-stage-design.md). three.js, loaded lazily by IntroStage
// only: never part of the home page's initial JavaScript. Every value comes from introFrame(progress, pick).
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { cappedDpr } from "@/lib/fx";
import { introFrame, RING_COUNT, RING_STEP } from "@/lib/intro";
import { SHOWCASE } from "@/lib/showcase";

const MASCOT_H = 2.2;        // world units
const RING_SCALE = 0.55;     // ring costumes, relative to the mascot
const RING_R = 2.6;
const RING_Z = -0.4;         // ring centre, a little behind the mascot
const LAYERS = 6;            // planes per sticker: the front picture plus 5 dark ones behind it for thickness
const DEPTH = MASCOT_H * 0.015;
const EDGE = "#1a1030";
const PUMPKIN = "#ff7a1a";

interface Art { front: THREE.Texture; edge: THREE.Texture; rim: THREE.Texture }
// group: the picture and its thickness; shadow: on the floor, positioned by the caller (it must not hop or lean)
interface Sticker { group: THREE.Group; shadow: THREE.Mesh; setArt(art: Art): void }

// One picture, three textures: the picture itself, and its silhouette filled dark (edge) and pumpkin (rim).
function makeArt(img: HTMLImageElement): Art {
  const silhouette = (color: string) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const front = new THREE.Texture(img);
  front.colorSpace = THREE.SRGBColorSpace;
  front.needsUpdate = true;
  return { front, edge: silhouette(EDGE), rim: silhouette(PUMPKIN) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => new THREE.ImageLoader().load(src, resolve, undefined, () => reject(new Error(`could not load ${src}`))));
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A cut-out standing on the floor at its bottom edge: front picture, dark layers behind it (seen when it turns), and a
// thin pumpkin rim. Hidden until its picture has loaded.
function makeSticker(scene: THREE.Scene, plane: THREE.PlaneGeometry, shadowGeo: THREE.PlaneGeometry, shadowTex: THREE.Texture): Sticker {
  const group = new THREE.Group();
  const front = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02 });
  const edge = new THREE.MeshBasicMaterial({ alphaTest: 0.5 });
  const rim = new THREE.MeshBasicMaterial({ alphaTest: 0.5 });
  group.add(new THREE.Mesh(plane, front));
  for (let k = 1; k < LAYERS; k++) {
    const layer = new THREE.Mesh(plane, edge);
    layer.position.z = -k * DEPTH;
    group.add(layer);
  }
  const rimMesh = new THREE.Mesh(plane, rim);
  rimMesh.scale.set(1.03, 1.03, 1);
  rimMesh.position.z = -LAYERS * DEPTH;
  group.add(rimMesh);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.visible = shadow.visible = false;
  scene.add(group, shadow);
  return {
    group,
    shadow,
    setArt(art) {
      front.map = art.front;
      edge.map = art.edge;
      rim.map = art.rim;
      for (const m of [front, edge, rim]) m.needsUpdate = true;
      group.visible = shadow.visible = true;
    },
  };
}

export default function IntroScene({ progress, pick, active, wide, onReady }: {
  progress: RefObject<number>; pick: number; active: boolean; wide: boolean; onReady(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const startRef = useRef<() => void>(() => {});
  const readyRef = useRef(onReady);
  const [error, setError] = useState<Error | null>(null);
  if (error) throw error; // a picture that never loads: FxBoundary shows today's hero

  useEffect(() => { readyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(wide ? cappedDpr(window.devicePixelRatio) : 1);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    let w = 1, h = 1;
    const resize = () => {
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const plane = new THREE.PlaneGeometry(MASCOT_H, MASCOT_H).translate(0, MASCOT_H / 2, 0);
    const shadowGeo = new THREE.PlaneGeometry(MASCOT_H * 0.8, MASCOT_H * 0.3);
    const shadowTex = radialTexture([[0, "rgba(0,0,0,0.55)"], [1, "rgba(0,0,0,0)"]]);
    const floorTex = radialTexture([[0, "rgba(255,122,26,0.35)"], [0.5, "rgba(120,50,160,0.18)"], [1, "rgba(13,10,20,0)"]]);
    const puffTex = radialTexture([[0, "rgba(255,190,120,1)"], [0.45, "rgba(255,122,26,0.7)"], [1, "rgba(255,122,26,0)"]]);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const mascot = makeSticker(scene, plane, shadowGeo, shadowTex);
    const ring = Array.from({ length: RING_COUNT }, () => makeSticker(scene, plane, shadowGeo, shadowTex));

    const smokeCount = wide ? 40 : 20;
    const puffs = Array.from({ length: smokeCount }, (_, i) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: i % 3 ? "#ffffff" : "#c9b8e6" }));
      // fixed directions (no Math.random): the puff looks the same every time it plays
      const a = i * 2.399963; // golden angle
      const dir = new THREE.Vector3(Math.cos(a), 0.6 * Math.sin(i * 1.7), Math.sin(a) * 0.6).normalize();
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, dir };
    });

    const arts: (Art | undefined)[] = [];
    let plain: Art | undefined;
    let wearing = -2; // the picture the mascot shows; -2 = none yet
    let disposed = false;
    const load = (src: string) => loadImage(src).then((img) => (disposed ? undefined : makeArt(img)));
    load(SHOWCASE[0].cut)
      .then((art) => {
        if (!art) return;
        plain = art;
        // the costumes load after the plain mascot is up
        return Promise.all(SHOWCASE.slice(1).map((c, i) => load(c.cut).then((a) => { if (a) { arts[i] = a; ring[i].setArt(a); } })));
      })
      .catch((e: Error) => { if (!disposed) setError(e); });

    let raf = 0;
    let announced = false;
    const frame = (now: number) => {
      raf = activeRef.current ? requestAnimationFrame(frame) : 0;
      const f = introFrame(progress.current ?? 0, pick);
      const t = now / 1000;

      camera.position.set(0, 1.6 + (f.camZ - 6) * 0.25, f.camZ);
      camera.lookAt(0, 1.1, 0);
      // while the text shows, the stage sits beside it (desktop) or below it (phone)
      const c = Math.max(f.textIn, f.textOut);
      if (wide) camera.setViewOffset(w, h, -w * 0.2 * c, 0, w, h);
      else camera.setViewOffset(w, h, 0, -h * 0.14 * c, w, h);

      if (plain && f.wearing !== wearing) {
        const art = f.wearing < 0 ? plain : arts[f.wearing];
        if (art) { mascot.setArt(art); wearing = f.wearing; }
      }
      mascot.group.position.y = f.hop + 0.04 * Math.sin(t * 2);
      mascot.group.rotation.set(0, f.yaw, f.lean);
      mascot.group.scale.set(1 + 0.6 * f.squash, 1 - f.squash, 1);
      mascot.shadow.scale.setScalar(1 - 0.35 * f.hop); // smaller while it is in the air

      for (let i = 0; i < RING_COUNT; i++) {
        const { group: g, shadow } = ring[i];
        const a = f.ringAngle + i * RING_STEP;
        const s = RING_SCALE * f.ringRise * (i === pick ? 1 - f.pickedLeft : 1);
        const x = RING_R * Math.sin(a);
        const z = RING_Z + RING_R * Math.cos(a);
        g.position.set(x, -0.6 * (1 - f.ringRise) + 0.05 * Math.sin(t * 2 + i), z);
        g.scale.setScalar(Math.max(s, 1e-4));
        g.lookAt(camera.position.x, g.position.y, camera.position.z);
        g.rotation.y += 0.35 * Math.sin(a); // a little turn so the sticker's thickness shows as it travels
        g.visible = shadow.visible = !!arts[i] && s > 1e-3;
        shadow.position.set(x, 0.01, z);
        shadow.scale.setScalar(Math.max(s, 1e-4));
      }

      for (const { sprite, dir } of puffs) {
        sprite.visible = f.smoke > 0.01;
        if (!sprite.visible) continue;
        const r = 0.3 + 0.9 * f.smoke;
        sprite.position.set(dir.x * r, 1.1 + f.hop + dir.y * r, 0.4 + dir.z * r);
        sprite.scale.setScalar(0.6 + 1.4 * f.smoke);
        sprite.material.opacity = f.smoke;
      }

      renderer.render(scene, camera);
      if (plain && !announced) { announced = true; readyRef.current(); }
    };
    const start = () => { if (!raf && activeRef.current) raf = requestAnimationFrame(frame); };
    startRef.current = start;
    start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose();
      });
      for (const a of [plain, ...arts]) if (a) { a.front.dispose(); a.edge.dispose(); a.rim.dispose(); }
      plane.dispose();
      shadowGeo.dispose();
      floor.geometry.dispose();
      shadowTex.dispose();
      floorTex.dispose();
      puffTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [pick, wide, progress]);

  // off screen or a hidden tab: stop drawing; back on screen: start again
  useEffect(() => {
    activeRef.current = active;
    if (active) startRef.current();
  }, [active]);

  return <div ref={host} aria-hidden className="absolute inset-0" />;
}
```

- [ ] **Step 5: Write `apps/web/components/home/IntroStage.tsx`**

```tsx
"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { introFrame, INTRO_SVH, progressAt, randomPick } from "@/lib/intro";
import { SHOWCASE } from "@/lib/showcase";
import { useFx, useVisibility, useWide } from "@/lib/use-fx";
import { CostumeMorph } from "./CostumeMorph";
import { HeroBackground } from "./HeroBackground";
import { HeroCopy } from "./HeroCopy";

const IntroScene = dynamic(() => import("./IntroScene"), { ssr: false });

// The scroll intro (spec 2026-10-09-spookpad-intro-stage-design.md): a tall section with a sticky stage. Scroll
// progress drives the 3D scene and the text. Until the scene has drawn the mascot, the stage looks like today's hero.
export function IntroStage() {
  const fx = useFx();
  const wide = useWide();
  const ref = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const readyRef = useRef(false);
  const [pick] = useState(randomPick); // a different costume on each visit
  const [ready, setReady] = useState(false);
  const [wearing, setWearing] = useState(-1);
  const { active } = useVisibility(ref, "0px");

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const p = progressAt(box.top, box.height, window.innerHeight);
    progress.current = p;
    const f = introFrame(p, pick);
    const c = copy.current;
    if (c) {
      // the text stays put until the scene is up, so the stage never shows an empty screen
      const opacity = readyRef.current ? Math.max(f.textIn, f.textOut) : 1;
      c.style.opacity = String(opacity);
      c.inert = opacity < 0.1;
    }
    setWearing(f.wearing);
  }, [pick]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    onScroll(); // the first position (a reload can land mid-intro)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [update]);

  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
    update();
  }, [update]);

  const chosen = wearing >= 0 ? SHOWCASE[wearing + 1].label : "";
  return (
    <section ref={ref} aria-label="SpookPad" className="intro-bleed relative" style={{ height: `${INTRO_SVH}svh` }}>
      <div className="sticky top-0 isolate h-[100svh] overflow-hidden pt-[var(--header-h,4.5rem)]">
        <HeroBackground webgl={fx.heroWebGL} paused={!active} />
        <div className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}>
          <IntroScene progress={progress} pick={pick} active={active} wide={wide} onReady={onReady} />
        </div>
        <div className="relative mx-auto grid h-full w-full max-w-5xl content-center items-center gap-8 px-4 pb-16 md:grid-cols-[1.15fr_1fr] md:gap-10">
          <div ref={copy} className="grid justify-items-center gap-6 text-center md:justify-items-start md:text-left">
            <HeroCopy animate />
            <p aria-live="polite" className="min-h-8 font-display text-2xl text-ghost">{chosen && `It chose the ${chosen}`}</p>
          </div>
          {/* today's picture holds the mascot's place until the 3D mascot is drawn, then fades out */}
          <div className={`transition-opacity duration-700 motion-reduce:transition-none ${ready ? "pointer-events-none opacity-0" : ""}`}>
            <CostumeMorph animate active={active && !ready} />
          </div>
        </div>
        <a href="#stats" className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-line bg-night/60 px-4 py-1.5 text-sm text-muted backdrop-blur hover:text-ghost focus-visible:outline-2 focus-visible:outline-ghost">
          Skip intro
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Check it**

Run (repo root): `npx vitest run && npm run typecheck && npx eslint apps/web/components apps/web/lib && npm run build && node apps/web/scripts/check-initial-js.mjs`
Expected: all tests pass; typecheck silent; eslint reports 0 errors (the 7 existing warnings in `components/bits`
are known); build succeeds; check-initial-js prints `three: in N chunk(s) overall, 0 of them in the home page's initial JS`
and exits 0. If eslint's React rules flag a pattern above (for example a ref or state update), fix it the way the
rule suggests without changing behaviour.

Then in a browser (Chrome DevTools MCP), against the preview server at http://localhost:4173 (it serves
`apps/web/out`; if it is not running, start `npx http-server apps/web/out -p 4173 -s -c-1` in the background):
1. Desktop 1280 x 800: at the top, the headline, buttons and mascot show like today's hero, then the 3D mascot takes
   over with no jump. Scroll slowly to the end: the camera glides in, the costumes rise, the ring turns, the mascot
   turns toward the costumes, hops into a puff of smoke, lands in the picked costume, and the text returns with
   "It chose the ...". Scroll back up: it reverses. The page then continues into the stats.
2. 375 x 812: the same, with no horizontal scroll (`document.documentElement.scrollWidth === 375`).
3. Reduced motion (emulate `prefers-reduced-motion: reduce`): today's hero, the section is 100 svh, no canvas.
4. "Skip intro" lands on the stats section.
5. No console errors.

Fix anything that fails (framing numbers such as camera height, ring radius and view offsets may be tuned so the
mascot and ring sit well on both sizes), then rerun the Step 6 commands.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/home/HeroCopy.tsx apps/web/components/home/IntroScene.tsx apps/web/components/home/IntroStage.tsx apps/web/components/home/Hero.tsx apps/web/app/globals.css
git commit -m "feat(web): the 3D scroll intro - the mascot picks a costume from the wardrobe ring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
