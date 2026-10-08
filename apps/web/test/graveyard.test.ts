import { expect, test } from "vitest";
import { sortCoins, type GraveCoin } from "../lib/graveyard";

const coin = (mint: string, launched_at: string): GraveCoin => ({
  mint, name: mint, ticker: mint, description: "", twitter: null, telegram: null, wallet: "W", launched_at, costume: "ghost",
  original_path: "o", result_path: "c",
});
const coins = [coin("A", "2026-10-08T10:00:00Z"), coin("B", "2026-10-08T12:00:00Z"), coin("C", "2026-10-08T11:00:00Z")];

test("newest first, or biggest market cap first (unknown caps last)", () => {
  expect(sortCoins(coins, {}, "new").map((c) => c.mint)).toEqual(["B", "C", "A"]);
  expect(sortCoins(coins, { A: 50_000, C: 9_000 }, "cap").map((c) => c.mint)).toEqual(["A", "C", "B"]);
});
