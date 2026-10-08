import { expect, test } from "vitest";
import { dexMarketCaps } from "../lib/dexscreener";

test("asks for up to 30 tokens per call and keeps each token's biggest market cap", async () => {
  const mints = Array.from({ length: 31 }, (_, i) => `M${i}`);
  const urls: string[] = [];
  const caps = await dexMarketCaps(mints, async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify([
      { baseToken: { address: "M0" }, marketCap: 1000 },
      { baseToken: { address: "M0" }, marketCap: 5000 },
      { baseToken: { address: "M1" }, fdv: 700 },
      { baseToken: { address: "SOMETHING_ELSE" }, marketCap: 9 },
    ]));
  });
  expect(urls).toHaveLength(2);
  expect(urls[0]).toBe(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(0, 30).join(",")}`);
  expect(caps).toEqual({ M0: 5000, M1: 700 });
});

test("a failing call leaves those caps out instead of throwing", async () => {
  expect(await dexMarketCaps(["A"], async () => new Response("x", { status: 429 }))).toEqual({});
  expect(await dexMarketCaps(["A"], async () => { throw new Error("offline"); })).toEqual({});
  expect(await dexMarketCaps([], async () => { throw new Error("not called"); })).toEqual({});
});
