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
