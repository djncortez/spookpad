import { expect, test } from "vitest";
import { walletFromSession } from "../lib/session-wallet";

const W = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

test("reads the wallet from a Web3 session", () => {
  expect(walletFromSession({ user: { user_metadata: { custom_claims: { address: W } } } })).toBe(W);
  expect(walletFromSession({ user: { user_metadata: { sub: `web3:solana:${W}` } } })).toBe(W);
});

test("no session or no wallet gives null", () => {
  expect(walletFromSession(null)).toBeNull();
  expect(walletFromSession({ user: { user_metadata: { sub: "email:x" } } })).toBeNull();
  expect(walletFromSession({ user: { user_metadata: { custom_claims: { address: "nope" } } } })).toBeNull();
});
