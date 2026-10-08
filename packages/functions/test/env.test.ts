import { expect, test } from "vitest";
import { requireEnv, requireServiceKey, requireSolanaAddress } from "../src/env";

test("requireEnv returns the requested keys", () => {
  expect(requireEnv({ A: "1", B: "2", C: undefined }, "A", "B")).toEqual({ A: "1", B: "2" });
});

test("requireEnv throws naming every missing key", () => {
  expect(() => requireEnv({ A: "1" }, "A", "B", "C")).toThrow(/Missing function secrets: B, C/);
});

test("requireServiceKey prefers SUPABASE_SERVICE_ROLE_KEY over SERVICE_KEY", () => {
  expect(requireServiceKey({ SUPABASE_SERVICE_ROLE_KEY: "role-key", SERVICE_KEY: "sb_secret_x" })).toBe("role-key");
});

test("requireServiceKey falls back to SERVICE_KEY (new-style sb_secret_… key)", () => {
  expect(requireServiceKey({ SERVICE_KEY: "sb_secret_x" })).toBe("sb_secret_x");
});

test("requireServiceKey throws naming both env vars when neither is set", () => {
  expect(() => requireServiceKey({})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  expect(() => requireServiceKey({})).toThrow(/SERVICE_KEY/);
});

test("requireSolanaAddress accepts a base58 address and names the secret otherwise", () => {
  expect(requireSolanaAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "TREASURY_ADDRESS")).toBe("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  expect(() => requireSolanaAddress("not-an-address", "TREASURY_ADDRESS")).toThrow(/TREASURY_ADDRESS must be a Solana address/);
});
