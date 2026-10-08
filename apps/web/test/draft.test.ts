import { beforeEach, expect, test, vi } from "vitest";
import { forgetLaunch, forgetPayment, pendingPayment, rememberLaunch, rememberPayment, sentLaunch } from "../lib/draft";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
});

const pay = { generationId: "g1", draftId: "d1", signature: "SIG", expiry: { blockhash: "BH", lastValidBlockHeight: 5 } };
const launch = { generationId: "g1", mint: "M", signature: "SIG", expiry: { blockhash: "BH" } };

test("a pending payment is stored per wallet and only read back for that wallet", () => {
  rememberPayment("walletA", pay);
  expect([...store.keys()]).toEqual(["spookpad:pending-payment:walletA"]);
  expect(pendingPayment("walletA")).toEqual(pay);
  expect(pendingPayment("walletB")).toBeNull();
  forgetPayment("walletB");
  expect(pendingPayment("walletA")).toEqual(pay);
  forgetPayment("walletA");
  expect(pendingPayment("walletA")).toBeNull();
});

test("a sent launch is stored per wallet and only read back for that wallet", () => {
  rememberLaunch("walletA", launch);
  expect([...store.keys()]).toEqual(["spookpad:sent-launch:walletA"]);
  expect(sentLaunch("walletA")).toEqual(launch);
  expect(sentLaunch("walletB")).toBeNull();
  forgetLaunch("walletA");
  expect(sentLaunch("walletA")).toBeNull();
});

test("a damaged record reads as nothing", () => {
  store.set("spookpad:pending-payment:walletA", JSON.stringify({ generationId: "g1" }));
  store.set("spookpad:sent-launch:walletA", "not json");
  expect(pendingPayment("walletA")).toBeNull();
  expect(sentLaunch("walletA")).toBeNull();
});
