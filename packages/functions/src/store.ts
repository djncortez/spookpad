// Database reads and writes for the Edge Functions (service role, via PostgREST). The SQL functions in
// supabase/migrations/0001_spookpad.sql do the real work; the codes they raise become StoreErrors.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostumePatch } from "@spookpad/core/costumes";
import { sniffImageType, type Art } from "@spookpad/core/image-type";
import { rowToSettings, type Settings } from "@spookpad/core/settings";
import { STORE_CODES, StoreError } from "./errors";

export type GenerationState = "awaiting_payment" | "paid" | "generating" | "ready" | "failed";
export interface GenerationRow {
  id: string; wallet: string; draft_id: string; costume: string; original_path: string; result_path: string | null;
  state: GenerationState; fee_lamports: number; attempts: number; error: string | null; metadata_key: string | null;
  metadata_uri: string | null; refunded_at: string | null; created_at: string;
}
export interface LaunchRow {
  mint: string; wallet: string; generation_id: string; name: string; ticker: string; description: string;
  twitter: string | null; telegram: string | null; dev_buy_lamports: number; metadata_uri: string;
  launch_fee_lamports: number; create_signature: string | null; state: "pending" | "live" | "abandoned"; launched_at: string | null;
}
export interface NewLaunch {
  mint: string; wallet: string; generationId: string; name: string; ticker: string; description: string;
  twitter: string | null; telegram: string | null; devBuyLamports: number; metadataUri: string; launchFeeLamports: number;
}
export interface CostumeRow { slug: string; label: string; emoji: string; prompt: string; sort: number; enabled: boolean }
export interface FailedGeneration { id: string; wallet: string; costume: string; fee_lamports: number; error: string | null; created_at: string; refunded_at: string | null }
export interface Overview {
  generations_24h: number; ready_24h: number; launches_24h: number; live_launches: number; failed_unrefunded: number;
  costume_fees_lamports: number; launch_fees_lamports: number;
}

const toGeneration = (r: unknown): GenerationRow => {
  const g = r as GenerationRow;
  return { ...g, fee_lamports: Number(g.fee_lamports) };
};
const toLaunch = (r: unknown): LaunchRow => {
  const l = r as LaunchRow;
  return { ...l, dev_buy_lamports: Number(l.dev_buy_lamports), launch_fee_lamports: Number(l.launch_fee_lamports) };
};

async function call<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (STORE_CODES.has(error.message)) throw new StoreError(error.message);
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}

// ===== settings =====
export async function loadSettings(db: SupabaseClient): Promise<Settings> {
  const { data, error } = await db.from("settings").select("*").single();
  if (error) throw new Error(`settings: ${error.message}`);
  return rowToSettings(data);
}

export async function updateSettings(db: SupabaseClient, changed: Partial<Settings>, admin: string): Promise<Settings> {
  return rowToSettings(await call(db, "admin_update_settings", { p_changes: changed, p_admin: admin }));
}

export const pauseForLowCredit = (db: SupabaseClient): Promise<boolean> => call<boolean>(db, "pause_for_low_credit", {});

// ===== generations =====
export async function startGeneration(db: SupabaseClient, g: { id: string; wallet: string; draftId: string; costume: string; originalPath: string }): Promise<GenerationRow> {
  return toGeneration(await call(db, "start_generation", {
    p_id: g.id, p_wallet: g.wallet, p_draft: g.draftId, p_costume: g.costume, p_original_path: g.originalPath,
  }));
}

export async function loadGeneration(db: SupabaseClient, id: string): Promise<GenerationRow | null> {
  const { data, error } = await db.from("generations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`generations: ${error.message}`);
  return data ? toGeneration(data) : null;
}

export const claimPayment = async (db: SupabaseClient, signature: string, generationId: string, wallet: string, lamports: number) =>
  toGeneration(await call(db, "claim_payment", { p_signature: signature, p_generation: generationId, p_wallet: wallet, p_lamports: lamports }));

export const beginAttempt = async (db: SupabaseClient, id: string, wallet: string) =>
  toGeneration(await call(db, "begin_attempt", { p_generation: id, p_wallet: wallet }));

export const finishAttempt = async (db: SupabaseClient, id: string, resultPath: string | null, error: string | null) =>
  toGeneration(await call(db, "finish_attempt", { p_generation: id, p_result_path: resultPath, p_error: error }));

export async function loadCostumePrompt(db: SupabaseClient, slug: string): Promise<string | null> {
  const { data, error } = await db.from("costumes").select("prompt").eq("slug", slug).eq("enabled", true).maybeSingle();
  if (error) throw new Error(`costumes: ${error.message}`);
  return (data as { prompt: string } | null)?.prompt ?? null;
}

export async function saveMetadata(db: SupabaseClient, id: string, key: string, uri: string): Promise<void> {
  const { error } = await db.from("generations").update({ metadata_key: key, metadata_uri: uri }).eq("id", id);
  if (error) throw new Error(`generations update: ${error.message}`);
}

// ===== launches =====
export async function beginLaunch(db: SupabaseClient, l: NewLaunch): Promise<LaunchRow> {
  return toLaunch(await call(db, "begin_launch", {
    p_mint: l.mint, p_wallet: l.wallet, p_generation: l.generationId, p_name: l.name, p_ticker: l.ticker,
    p_description: l.description, p_twitter: l.twitter, p_telegram: l.telegram, p_dev_buy: l.devBuyLamports,
    p_metadata_uri: l.metadataUri, p_launch_fee: l.launchFeeLamports,
  }));
}

export async function loadLaunch(db: SupabaseClient, mint: string): Promise<LaunchRow | null> {
  const { data, error } = await db.from("launches").select("*").eq("mint", mint).maybeSingle();
  if (error) throw new Error(`launches: ${error.message}`);
  return data ? toLaunch(data) : null;
}

export const confirmLaunch = async (db: SupabaseClient, mint: string, wallet: string, signature: string) =>
  toLaunch(await call(db, "confirm_launch", { p_mint: mint, p_wallet: wallet, p_signature: signature }));

// ===== art (Storage bucket "art") =====
export async function uploadArt(db: SupabaseClient, path: string, art: Art): Promise<void> {
  const { error } = await db.storage.from("art").upload(path, new Blob([art.bytes as BlobPart], { type: art.type }), { contentType: art.type, upsert: true });
  if (error) throw new Error(`storage upload ${path}: ${error.message}`);
}

export async function removeArt(db: SupabaseClient, path: string): Promise<void> {
  const { error } = await db.storage.from("art").remove([path]);
  if (error) throw new Error(`storage remove ${path}: ${error.message}`);
}

export async function downloadArt(db: SupabaseClient, path: string): Promise<Art> {
  const { data, error } = await db.storage.from("art").download(path);
  if (error || !data) throw new Error(`storage download ${path}: ${error?.message ?? "no data"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw new Error(`storage download ${path}: not an image`);
  return { bytes, type };
}

// ===== admin =====
export async function listCostumes(db: SupabaseClient): Promise<CostumeRow[]> {
  const { data, error } = await db.from("costumes").select("*").order("sort");
  if (error) throw new Error(`costumes: ${error.message}`);
  return data as CostumeRow[];
}

export const updateCostume = (db: SupabaseClient, slug: string, patch: CostumePatch, admin: string): Promise<CostumeRow> =>
  call<CostumeRow>(db, "admin_update_costume", { p_slug: slug, p_changes: patch, p_admin: admin });

export async function adminOverview(db: SupabaseClient): Promise<Overview> {
  const o = await call<Record<string, unknown>>(db, "admin_overview", {});
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)])) as unknown as Overview;
}

export async function listFailed(db: SupabaseClient): Promise<FailedGeneration[]> {
  const { data, error } = await db.from("generations")
    .select("id, wallet, costume, fee_lamports, error, created_at, refunded_at")
    .eq("state", "failed").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`generations: ${error.message}`);
  return (data as FailedGeneration[]).map((g) => ({ ...g, fee_lamports: Number(g.fee_lamports) }));
}

export const markRefunded = async (db: SupabaseClient, id: string, admin: string): Promise<void> => {
  await call(db, "admin_mark_refunded", { p_generation: id, p_admin: admin });
};
