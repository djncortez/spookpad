import { describe, expect, test } from "vitest";
import { checkDevBuy, validateCoinFields } from "../src/validate";

const good = { name: " Spooky Frog ", ticker: "$sfrog", description: "Boo.", twitter: "https://x.com/sfrog", telegram: "" };

describe("validateCoinFields", () => {
  test("trims, uppercases the ticker and drops a leading $", () => {
    expect(validateCoinFields(good)).toEqual({
      ok: true,
      fields: { name: "Spooky Frog", ticker: "SFROG", description: "Boo.", twitter: "https://x.com/sfrog", telegram: null },
    });
  });
  test("name must be 1-32 characters", () => {
    expect(validateCoinFields({ ...good, name: "  " })).toEqual({ ok: false, errors: ["Name must be 1 to 32 characters."] });
    expect(validateCoinFields({ ...good, name: "x".repeat(33) }).ok).toBe(false);
  });
  test("ticker must be 2-10 letters or digits", () => {
    expect(validateCoinFields({ ...good, ticker: "A" }).ok).toBe(false);
    expect(validateCoinFields({ ...good, ticker: "AB-C" }).ok).toBe(false);
    expect(validateCoinFields({ ...good, ticker: "ABCDEFGHIJK" }).ok).toBe(false);
  });
  test("description is at most 200 characters", () => {
    expect(validateCoinFields({ ...good, description: "x".repeat(201) })).toEqual({
      ok: false, errors: ["Description must be 200 characters or fewer."],
    });
  });
  test("links must be https on the right site", () => {
    expect(validateCoinFields({ ...good, twitter: "http://x.com/a" })).toEqual({ ok: false, errors: ["X link must start with https://x.com/"] });
    expect(validateCoinFields({ ...good, twitter: "https://evil.com/a" }).ok).toBe(false);
    expect(validateCoinFields({ ...good, telegram: "https://t.me/spooky" })).toMatchObject({ ok: true, fields: { telegram: "https://t.me/spooky" } });
    expect(validateCoinFields({ ...good, telegram: "https://t.co/x" })).toEqual({ ok: false, errors: ["Telegram link must start with https://t.me/"] });
  });
  test("garbage input lists every problem", () => {
    expect(validateCoinFields(null)).toEqual({ ok: false, errors: ["Name must be 1 to 32 characters.", "Ticker must be 2 to 10 letters or digits."] });
  });
});

describe("checkDevBuy", () => {
  test("0 up to the maximum, whole lamports", () => {
    expect(checkDevBuy(0, 5_000_000_000)).toBeNull();
    expect(checkDevBuy(5_000_000_000, 5_000_000_000)).toBeNull();
    expect(checkDevBuy(5_000_000_001, 5_000_000_000)).toBe("The dev buy can be at most 5 SOL.");
    expect(checkDevBuy(-1, 5_000_000_000)).toBe("The dev buy must be a SOL amount.");
    expect(checkDevBuy(0.5, 5_000_000_000)).toBe("The dev buy must be a SOL amount.");
    expect(checkDevBuy("1", 5_000_000_000)).toBe("The dev buy must be a SOL amount.");
  });
});
