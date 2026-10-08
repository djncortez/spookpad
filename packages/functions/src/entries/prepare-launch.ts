// Wiring for the Deno Edge Function (supabase/functions/prepare-launch/index.ts imports the bundle of this file).
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase) or SERVICE_KEY, SITE_ORIGINS,
// HELIUS_API_KEY (reads PumpPortal's lookup tables), TREASURY_ADDRESS, SITE_URL (the coin's website in its metadata);
// optional PINATA_JWT (IPFS fallback).
import { walletFromToken } from "../auth";
import { serviceClient } from "../db";
import { requireEnv, requireServiceKey, requireSolanaAddress, type Env } from "../env";
import { parseOrigins } from "../http";
import { lookupTableReader } from "../lookup-tables";
import { createPrepareLaunchHandler } from "../prepare-launch";
import { ipfsUploader, pumpPortalCreate } from "../pump-services";
import { heliusUrl, jsonRpc } from "../rpc";
import * as store from "../store";

export function serve(env: Env) {
  const e = requireEnv(env, "SUPABASE_URL", "SITE_ORIGINS", "HELIUS_API_KEY", "TREASURY_ADDRESS", "SITE_URL");
  const db = serviceClient(e.SUPABASE_URL, requireServiceKey(env));
  return createPrepareLaunchHandler({
    origins: parseOrigins(e.SITE_ORIGINS),
    treasury: requireSolanaAddress(e.TREASURY_ADDRESS, "TREASURY_ADDRESS"),
    siteUrl: e.SITE_URL,
    walletFromToken: (token) => walletFromToken(db, token),
    loadSettings: () => store.loadSettings(db),
    loadGeneration: (id) => store.loadGeneration(db, id),
    downloadArt: (path) => store.downloadArt(db, path),
    ipfs: ipfsUploader(env.PINATA_JWT),
    saveMetadata: (id, key, uri) => store.saveMetadata(db, id, key, uri),
    createTx: (p) => pumpPortalCreate(p),
    lookupTables: lookupTableReader(jsonRpc(heliusUrl(e.HELIUS_API_KEY))),
    beginLaunch: (l) => store.beginLaunch(db, l),
  });
}
