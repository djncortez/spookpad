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
