// Wiring for the Deno Edge Function (supabase/functions/costume/index.ts imports the bundle of this file).
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase) or SERVICE_KEY, SITE_ORIGINS, HELIUS_API_KEY,
// TREASURY_ADDRESS, OPENROUTER_API_KEY; optional OPENROUTER_MODEL, SITE_URL, TELEGRAM_BOT_TOKEN + ADMIN_TELEGRAM_CHAT_ID.
import { walletFromToken } from "../auth";
import { createCostumeHandler } from "../costume";
import { serviceClient } from "../db";
import { requireEnv, requireServiceKey, requireSolanaAddress, type Env } from "../env";
import { parseOrigins } from "../http";
import { openRouter } from "../openrouter";
import { telegramPoster } from "../pump-services";
import { heliusUrl, jsonRpc } from "../rpc";
import * as store from "../store";

export function serve(env: Env) {
  const e = requireEnv(env, "SUPABASE_URL", "SITE_ORIGINS", "HELIUS_API_KEY", "TREASURY_ADDRESS", "OPENROUTER_API_KEY");
  const db = serviceClient(e.SUPABASE_URL, requireServiceKey(env));
  return createCostumeHandler({
    origins: parseOrigins(e.SITE_ORIGINS),
    treasury: requireSolanaAddress(e.TREASURY_ADDRESS, "TREASURY_ADDRESS"),
    walletFromToken: (token) => walletFromToken(db, token),
    startGeneration: (g) => store.startGeneration(db, g),
    loadGeneration: (id) => store.loadGeneration(db, id),
    claimPayment: (signature, id, wallet, lamports) => store.claimPayment(db, signature, id, wallet, lamports),
    claimExpiredPayment: (signature, id, wallet, lamports) => store.claimExpiredPayment(db, signature, id, wallet, lamports),
    expireUnpaid: () => store.expireUnpaid(db),
    beginAttempt: (id, wallet) => store.beginAttempt(db, id, wallet),
    finishAttempt: (id, path, error) => store.finishAttempt(db, id, path, error),
    loadCostumePrompt: (slug) => store.loadCostumePrompt(db, slug),
    uploadArt: (path, art) => store.uploadArt(db, path, art),
    removeArt: (path) => store.removeArt(db, path),
    downloadArt: (path) => store.downloadArt(db, path),
    rpc: jsonRpc(heliusUrl(e.HELIUS_API_KEY)),
    ai: openRouter({ apiKey: e.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL, siteUrl: env.SITE_URL }),
    minCreditUsd: async () => (await store.loadSettings(db)).min_ai_credit_usd,
    pauseForLowCredit: () => store.pauseForLowCredit(db),
    alert: telegramPoster(env.TELEGRAM_BOT_TOKEN, env.ADMIN_TELEGRAM_CHAT_ID),
    newId: () => crypto.randomUUID(),
  });
}
