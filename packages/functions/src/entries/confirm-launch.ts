// Wiring for the Deno Edge Function (supabase/functions/confirm-launch/index.ts imports the bundle of this file).
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase) or SERVICE_KEY, SITE_ORIGINS, HELIUS_API_KEY,
// TREASURY_ADDRESS.
import { walletFromToken } from "../auth";
import { createConfirmLaunchHandler } from "../confirm-launch";
import { serviceClient } from "../db";
import { requireEnv, requireServiceKey, requireSolanaAddress, type Env } from "../env";
import { parseOrigins } from "../http";
import { heliusUrl, jsonRpc } from "../rpc";
import * as store from "../store";

export function serve(env: Env) {
  const e = requireEnv(env, "SUPABASE_URL", "SITE_ORIGINS", "HELIUS_API_KEY", "TREASURY_ADDRESS");
  const db = serviceClient(e.SUPABASE_URL, requireServiceKey(env));
  return createConfirmLaunchHandler({
    origins: parseOrigins(e.SITE_ORIGINS),
    treasury: requireSolanaAddress(e.TREASURY_ADDRESS, "TREASURY_ADDRESS"),
    walletFromToken: (token) => walletFromToken(db, token),
    loadLaunch: (mint) => store.loadLaunch(db, mint),
    rpc: jsonRpc(heliusUrl(e.HELIUS_API_KEY)),
    confirmLaunch: (mint, wallet, signature) => store.confirmLaunch(db, mint, wallet, signature),
  });
}
