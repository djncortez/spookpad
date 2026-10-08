// Wiring for the Deno Edge Function (supabase/functions/admin/index.ts imports the bundle of this file).
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase) or SERVICE_KEY, SITE_ORIGINS, ADMIN_WALLET,
// ADMIN_SESSION_SECRET (checked at sign-in, so a missing one gives a clear message there); OPENROUTER_API_KEY for the
// credit balance (without it the balance shows as unknown).
import { createAdminHandler } from "../admin";
import { serviceClient } from "../db";
import { requireEnv, requireServiceKey, type Env } from "../env";
import { parseOrigins } from "../http";
import { openRouter } from "../openrouter";
import * as store from "../store";

export function serve(env: Env) {
  const e = requireEnv(env, "SUPABASE_URL", "SITE_ORIGINS");
  const db = serviceClient(e.SUPABASE_URL, requireServiceKey(env));
  const ai = env.OPENROUTER_API_KEY ? openRouter({ apiKey: env.OPENROUTER_API_KEY }) : null;
  return createAdminHandler({
    env: { ADMIN_WALLET: env.ADMIN_WALLET, ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET },
    origins: parseOrigins(e.SITE_ORIGINS),
    loadSettings: () => store.loadSettings(db),
    saveSettings: (changed, admin) => store.updateSettings(db, changed, admin),
    listCostumes: () => store.listCostumes(db),
    updateCostume: (slug, patch, admin) => store.updateCostume(db, slug, patch, admin),
    overview: () => store.adminOverview(db),
    credits: async () => (ai ? ai.credits() : null),
    listFailed: () => store.listFailed(db),
    markRefunded: (id, admin) => store.markRefunded(db, id, admin),
    now: Date.now,
  });
}
