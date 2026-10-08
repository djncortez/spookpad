// Builds every Edge Function bundle and loads it: catches bundling and wiring problems before a deploy.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, expect, test } from "vitest";
import { newKeypair } from "@spookpad/core/keys";

const entries = readdirSync(path.join("packages", "functions", "src", "entries")).map((f) => f.replace(/\.ts$/, "")).sort();
const ORIGIN = "http://localhost:3000";
const env = {
  SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", SITE_ORIGINS: ORIGIN, SITE_URL: "https://spookpad.fun",
  HELIUS_API_KEY: "helius", TREASURY_ADDRESS: newKeypair().publicKey, OPENROUTER_API_KEY: "or",
  ADMIN_WALLET: newKeypair().publicKey, ADMIN_SESSION_SECRET: "s".repeat(40),
};

beforeAll(() => { execFileSync(process.execPath, ["scripts/build-functions.mjs"], { stdio: "pipe" }); }, 120_000);

test("the four functions exist", () => {
  expect(entries).toEqual(["admin", "confirm-launch", "costume", "prepare-launch"]);
});

test.each(entries)("%s bundle loads and answers a CORS preflight", async (name) => {
  const mod = await import(pathToFileURL(path.resolve("supabase", "functions", name, "bundle.mjs")).href);
  const handler = mod.serve(env);
  const res = await handler(new Request(`https://x/functions/v1/${name}`, { method: "OPTIONS", headers: { origin: ORIGIN } }));
  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
});

test("a missing secret is named", async () => {
  const mod = await import(pathToFileURL(path.resolve("supabase", "functions", "costume", "bundle.mjs")).href);
  expect(() => mod.serve({ ...env, OPENROUTER_API_KEY: undefined })).toThrow(/OPENROUTER_API_KEY/);
});
