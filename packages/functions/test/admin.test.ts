import { describe, expect, test } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { toBase64, utf8 } from "@spookpad/core/encoding";
import { newKeypair } from "@spookpad/core/keys";
import { DEFAULT_SETTINGS, type Settings } from "@spookpad/core/settings";
import { createAdminHandler, type AdminDeps } from "../src/admin";
import { StoreError } from "../src/errors";
import type { CostumeRow, FailedGeneration } from "../src/store";

const ORIGIN = "https://spookpad.fun";
const admin = newKeypair();
const env = { ADMIN_WALLET: admin.publicKey, ADMIN_SESSION_SECRET: "s".repeat(40) };
const ghost: CostumeRow = { slug: "ghost", label: "Ghost sheet", emoji: "👻", prompt: "a white bedsheet ghost costume", sort: 1, enabled: true };
const FAILED_ID = "00000000-0000-4000-8000-000000000001";

function setup() {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  const log = { refunded: [] as string[], costumes: [] as unknown[] };
  const failed: FailedGeneration[] = [{ id: FAILED_ID, wallet: "W", costume: "ghost", fee_lamports: 1_000_000, error: "x", created_at: "t", refunded_at: null }];
  const deps: AdminDeps = {
    env, origins: [ORIGIN], failDelayMs: 0, now: Date.now,
    loadSettings: async () => settings,
    saveSettings: async (changed) => (settings = { ...settings, ...changed }),
    listCostumes: async () => [ghost],
    updateCostume: async (slug, patch) => { if (slug !== "ghost") throw new StoreError("not_found"); log.costumes.push(patch); return { ...ghost, ...patch }; },
    overview: async () => ({ generations_24h: 3, ready_24h: 2, launches_24h: 1, live_launches: 1, failed_unrefunded: 1, costume_fees_lamports: 3_000_000, launch_fees_lamports: 20_000_000 }),
    credits: async () => 7.5,
    listFailed: async () => failed,
    markRefunded: async (id) => { if (id !== FAILED_ID) throw new StoreError("not_refundable"); log.refunded.push(id); },
  };
  const handler = createAdminHandler(deps);
  const call = async (method: string, path: string, o: { body?: unknown; session?: string; origin?: string } = {}) => {
    const headers: Record<string, string> = { origin: o.origin ?? ORIGIN, "content-type": "application/json" };
    if (o.session) headers.authorization = `Bearer ${o.session}`;
    const res = await handler(new Request(`https://x/functions/v1/admin/${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }));
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const signIn = async () => {
    const c = (await call("GET", `login?wallet=${admin.publicKey}`)).body;
    const signature = toBase64(ed25519.sign(utf8(c.message), admin.secretKey.slice(0, 32)));
    return (await call("POST", "login", { body: { message: c.message, mac: c.mac, signature } })).body.session as string;
  };
  return { call, signIn, log };
}

describe("admin", () => {
  test("only the admin wallet signs in; other origins and missing sessions are refused", async () => {
    const { call, signIn } = setup();
    expect(typeof (await signIn())).toBe("string");
    expect((await call("GET", `login?wallet=${newKeypair().publicKey}`)).status).toBe(401);
    expect((await call("GET", "settings", { origin: "https://evil.site" })).status).toBe(403);
    expect(await call("GET", "settings")).toEqual({ status: 401, body: { error: "Your session ended. Sign in again." } });
  });

  test("settings are read and changed with validation", async () => {
    const { call, signIn } = setup();
    const session = await signIn();
    expect((await call("GET", "settings", { session })).body).toEqual(DEFAULT_SETTINGS);
    expect((await call("PATCH", "settings", { session, body: { launch_fee_lamports: 30_000_000, generations_paused: true } })).body)
      .toMatchObject({ launch_fee_lamports: 30_000_000, generations_paused: true, pause_reason: "admin" });
    expect((await call("PATCH", "settings", { session, body: { launch_fee_lamports: -5 } })).status).toBe(400);
  });

  test("the hero's CA is set, refused when it isn't an address, and removed", async () => {
    const { call, signIn } = setup();
    const session = await signIn();
    const CA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    expect((await call("PATCH", "settings", { session, body: { site_ca: CA } })).body).toMatchObject({ site_ca: CA });
    expect((await call("PATCH", "settings", { session, body: { site_ca: `https://pump.fun/coin/${CA}` } })).status).toBe(400);
    expect((await call("PATCH", "settings", { session, body: { site_ca: null } })).body).toMatchObject({ site_ca: null });
    expect((await call("PATCH", "settings", { body: { site_ca: CA } })).status).toBe(401);
  });

  test("costumes are listed and edited", async () => {
    const { call, signIn, log } = setup();
    const session = await signIn();
    expect((await call("GET", "costumes", { session })).body).toEqual({ costumes: [ghost] });
    expect((await call("PATCH", "costumes/ghost", { session, body: { prompt: "a long white sheet with eye holes" } })).body)
      .toMatchObject({ prompt: "a long white sheet with eye holes" });
    expect(log.costumes).toEqual([{ prompt: "a long white sheet with eye holes" }]);
    expect((await call("PATCH", "costumes/ghost", { session, body: { prompt: "x" } })).status).toBe(400);
    expect((await call("PATCH", "costumes/zombie", { session, body: { enabled: true } })).status).toBe(404);
  });

  test("overview includes the OpenRouter credit", async () => {
    const { call, signIn } = setup();
    const session = await signIn();
    expect((await call("GET", "overview", { session })).body).toMatchObject({ generations_24h: 3, credits_usd: 7.5 });
  });

  test("failed costumes are listed and marked refunded", async () => {
    const { call, signIn, log } = setup();
    const session = await signIn();
    expect((await call("GET", "failed", { session })).body.generations).toHaveLength(1);
    expect((await call("POST", `failed/${FAILED_ID}/refunded`, { session })).body).toEqual({ ok: true });
    expect(log.refunded).toEqual([FAILED_ID]);
    expect((await call("POST", "failed/00000000-0000-4000-8000-000000000009/refunded", { session })).status).toBe(409);
    expect((await call("GET", "nope", { session })).status).toBe(404);
  });
});
