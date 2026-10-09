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

  test("the costumes rise between 0.15 and 0.3, and sink away as the closing text comes in", () => {
    expect(introFrame(0.15, 0).ringRise).toBe(0);
    expect(introFrame(0.3, 0).ringRise).toBe(1);
    expect(introFrame(0.85, 0).ringRise).toBe(1);
    expect(introFrame(0.95, 0).ringRise).toBe(0);
    expect(introFrame(1, 0).ringRise).toBe(0);
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
