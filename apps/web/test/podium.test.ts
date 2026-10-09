import { describe, expect, test } from "vitest";
import type { GraveCoin } from "../lib/graveyard";
import { podium, trend } from "../lib/podium";

const coin = (mint: string): GraveCoin => ({
  mint, name: mint, ticker: mint.toUpperCase(), description: "", twitter: null, telegram: null, wallet: "w",
  launched_at: "2026-10-09T00:00:00Z", costume: "ghost", original_path: "o", result_path: "r",
});

describe("podium", () => {
  test("the three highest market caps, highest first, with their rank", () => {
    const coins = ["a", "b", "c", "d"].map(coin);
    const out = podium(coins, { a: 10, b: 40, c: 30, d: 20 });
    expect(out.map((s) => [s.coin.mint, s.cap, s.rank])).toEqual([["b", 40, 1], ["c", 30, 2], ["d", 20, 3]]);
  });
  test("coins without a known cap are left out", () => {
    expect(podium(["a", "b", "c"].map(coin), { b: 5 }).map((s) => s.coin.mint)).toEqual(["b"]);
  });
  test("fewer than three coins: what there is; none: empty", () => {
    expect(podium([coin("a"), coin("b")], { a: 1, b: 2 })).toHaveLength(2);
    expect(podium([], {})).toEqual([]);
  });
  test("ties keep the Graveyard's order", () => {
    expect(podium(["a", "b", "c"].map(coin), { a: 7, b: 7, c: 7 }).map((s) => s.coin.mint)).toEqual(["a", "b", "c"]);
  });
  test("a cap that is not a positive finite number does not count", () => {
    expect(podium(["a", "b", "c"].map(coin), { a: Number.NaN, b: 0, c: -3 })).toEqual([]);
  });
});

test("trend: up, down, unchanged or unknown", () => {
  expect(trend(10, 12)).toBe("up");
  expect(trend(12, 10)).toBe("down");
  expect(trend(10, 10)).toBe(null);
  expect(trend(undefined, 10)).toBe(null);
  expect(trend(10, undefined)).toBe(null);
});
