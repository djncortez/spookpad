import { expect, test } from "vitest";
import { coinPageUrl, partyUrl, pumpUrl, shareText, xIntentUrl } from "../lib/share";

test("the share text names the coin, its ticker, its costume and SpookPad", () => {
  expect(shareText({ name: "Ghostchua", ticker: "GHOST" }, "Vampire")).toBe(
    "Ghostchua ($GHOST) just rose from the grave dressed as a Vampire. Launched on spookpad.xyz",
  );
});

test("without a costume name the text still reads well", () => {
  expect(shareText({ name: "Ghostchua", ticker: "GHOST" }, undefined)).toBe(
    "Ghostchua ($GHOST) just rose from the grave in costume. Launched on spookpad.xyz",
  );
});

test("the X intent link carries the text and the link, encoded", () => {
  const url = new URL(xIntentUrl("A & B $X #1", "https://pump.fun/coin/M1"));
  expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
  expect(url.searchParams.get("text")).toBe("A & B $X #1");
  expect(url.searchParams.get("url")).toBe("https://pump.fun/coin/M1");
});

test("links: pump.fun, the coin page, and the coin page with the launch party", () => {
  expect(pumpUrl("M1")).toBe("https://pump.fun/coin/M1");
  expect(coinPageUrl("https://spookpad.xyz", "M1")).toBe("https://spookpad.xyz/coin/?mint=M1");
  expect(coinPageUrl("http://localhost:4173/", "M1")).toBe("http://localhost:4173/coin/?mint=M1");
  expect(partyUrl("M1")).toBe("/coin/?mint=M1&party=1");
});
