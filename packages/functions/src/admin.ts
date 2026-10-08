// /functions/v1/admin/* for the admin page (served at the secret /<ADMIN_SLUG>/ on the site).  (spec §4.4)
//   GET  login?wallet=…               -> { message, mac }              only for ADMIN_WALLET
//   POST login                        -> { session, wallet, expires }  body: { message, mac, signature }
// Every other route needs Authorization: Bearer <session>:
//   GET  settings                     -> Settings
//   PATCH settings                    -> Settings | 400 { error, errors }
//   GET  costumes                     -> { costumes: CostumeRow[] }
//   PATCH costumes/<slug>             -> CostumeRow      body: { label?, emoji?, prompt?, enabled? }
//   GET  overview                     -> Overview + { credits_usd }   OpenRouter credit left (null if unreadable)
//   GET  failed                       -> { generations: FailedGeneration[] }   costumes that failed 3 times (refund by hand)
//   POST failed/<id>/refunded         -> { ok: true }    after sending the fee back from the treasury
// Requests must come from an origin in SITE_ORIGINS; the sign-in challenge names that origin's host.
import { login, makeChallenge, sessionWallet, type AdminEnv } from "@spookpad/core/admin-auth";
import { checkCostumePatch, COSTUME_SLUG, type CostumePatch } from "@spookpad/core/costumes";
import { validateSettingsPatch, type Settings } from "@spookpad/core/settings";
import { StoreError } from "./errors";
import { corsHeaders, json } from "./http";
import type { CostumeRow, FailedGeneration, Overview } from "./store";

export interface AdminDeps {
  env: AdminEnv;
  origins: string[];
  loadSettings(): Promise<Settings>;
  saveSettings(changed: Partial<Settings>, admin: string): Promise<Settings>;
  listCostumes(): Promise<CostumeRow[]>;
  updateCostume(slug: string, patch: CostumePatch, admin: string): Promise<CostumeRow>;
  overview(): Promise<Overview>;
  credits(): Promise<number | null>;
  listFailed(): Promise<FailedGeneration[]>;
  markRefunded(id: string, admin: string): Promise<void>;
  now(): number;
  failDelayMs?: number; // slows down guessing on a refused sign-in
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const readJson = async (req: Request): Promise<unknown> => { try { return await req.json(); } catch { return null; } };
const prop = (body: unknown, key: string): unknown =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;

export function createAdminHandler(d: AdminDeps) {
  const failDelay = d.failDelayMs ?? 1000;
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, d.origins);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const origin = req.headers.get("origin") ?? "";
    if (!d.origins.includes(origin)) return json({ error: "This page isn't allowed to use the admin API." }, 403);

    const host = new URL(origin).host;
    const url = new URL(req.url);
    // "/functions/v1/admin/failed/<id>/refunded" (or "/admin/…" inside Deno) -> ["failed", "<id>", "refunded"]
    const parts = url.pathname.split("/").filter(Boolean);
    const route = parts.slice(parts.lastIndexOf("admin") + 1);
    const [section, id, action] = route;
    const fail = (status: number, error: string) => json({ error }, status, cors);

    if (section === "login" && route.length === 1) {
      try {
        if (req.method === "GET") {
          return json(await makeChallenge({ wallet: url.searchParams.get("wallet") ?? "", host, env: d.env, now: d.now() }), 200, cors);
        }
        if (req.method === "POST") {
          const body = await readJson(req); // only these three fields: never let the caller pass host, env or now
          return json(await login({
            message: prop(body, "message"), mac: prop(body, "mac"), signature: prop(body, "signature"), host, env: d.env, now: d.now(),
          }), 200, cors);
        }
        return fail(405, "Method not allowed.");
      } catch (e) {
        await new Promise((r) => setTimeout(r, failDelay));
        return fail(401, (e as Error).message);
      }
    }

    const admin = await sessionWallet(req.headers.get("authorization"), d.env, d.now());
    if (!admin) return fail(401, "Your session ended. Sign in again.");

    try {
      if (section === "settings" && route.length === 1) {
        if (req.method === "GET") return json(await d.loadSettings(), 200, cors);
        if (req.method === "PATCH") {
          const current = await d.loadSettings();
          const result = validateSettingsPatch(current, await readJson(req));
          if (!result.ok) return json({ error: result.errors.join(" "), errors: result.errors }, 400, cors);
          if (Object.keys(result.changed).length === 0) return json(current, 200, cors);
          return json(await d.saveSettings(result.changed, admin), 200, cors);
        }
        return fail(405, "Method not allowed.");
      }
      if (section === "costumes" && route.length === 1 && req.method === "GET") {
        return json({ costumes: await d.listCostumes() }, 200, cors);
      }
      if (section === "costumes" && route.length === 2 && req.method === "PATCH") {
        if (!COSTUME_SLUG.test(id)) return fail(404, "Costume not found.");
        const result = checkCostumePatch(await readJson(req));
        if (!result.ok) return fail(400, result.error);
        return json(await d.updateCostume(id, result.changed, admin), 200, cors);
      }
      if (section === "overview" && route.length === 1 && req.method === "GET") {
        const [overview, credits] = await Promise.all([d.overview(), d.credits()]);
        return json({ ...overview, credits_usd: credits }, 200, cors);
      }
      if (section === "failed" && route.length === 1 && req.method === "GET") {
        return json({ generations: await d.listFailed() }, 200, cors);
      }
      if (section === "failed" && route.length === 3 && action === "refunded" && req.method === "POST") {
        if (!UUID.test(id)) return fail(404, "Costume not found.");
        await d.markRefunded(id, admin);
        return json({ ok: true }, 200, cors);
      }
      return fail(404, "Not found.");
    } catch (e) {
      if (e instanceof StoreError && e.code === "not_found") return fail(404, "Costume not found.");
      if (e instanceof StoreError && e.code === "not_refundable") return fail(409, "That costume isn't waiting for a refund.");
      console.error("admin failed", e);
      return fail(500, "Something went wrong. Try again in a minute.");
    }
  };
}
