// What the Launch page reads straight from Supabase's public views.
import { supabase } from "./supabase";
import type { Generation } from "./summon";

export interface PublicSettings {
  costume_fee_lamports: number;
  launch_fee_lamports: number;
  max_dev_buy_lamports: number;
  generations_paused: boolean;
  launches_paused: boolean;
  pause_reason: "admin" | "low_credit" | null;
}
export interface Costume { slug: string; label: string; emoji: string; sort: number }
export interface Stats { coins_launched: number; costumes_summoned: number }

export async function fetchSettings(): Promise<PublicSettings> {
  const { data, error } = await supabase().from("v_settings_public").select("*").single();
  if (error) throw new Error("Couldn't load SpookPad's settings. Reload the page.");
  const s = data as Record<string, unknown>;
  return {
    costume_fee_lamports: Number(s.costume_fee_lamports), launch_fee_lamports: Number(s.launch_fee_lamports),
    max_dev_buy_lamports: Number(s.max_dev_buy_lamports), generations_paused: s.generations_paused === true,
    launches_paused: s.launches_paused === true, pause_reason: (s.pause_reason as PublicSettings["pause_reason"]) ?? null,
  };
}

export async function fetchCostumes(): Promise<Costume[]> {
  const { data, error } = await supabase().from("v_costumes").select("*").order("sort");
  if (error) throw new Error("Couldn't load the costumes. Reload the page.");
  return data as Costume[];
}

export async function fetchDraftGenerations(draftId: string): Promise<Generation[]> {
  const { data, error } = await supabase().from("v_my_generations").select("*").eq("draft_id", draftId).order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your costumes. Reload the page.");
  return (data as Generation[]).map((g) => ({ ...g, fee_lamports: Number(g.fee_lamports) }));
}

// Public counts for the home page (v_stats, migration 0002): counts only.
export async function fetchStats(): Promise<Stats> {
  const { data, error } = await supabase().from("v_stats").select("*").single();
  if (error) throw new Error("Couldn't load SpookPad's numbers.");
  const s = data as Record<string, unknown>;
  return { coins_launched: Number(s.coins_launched), costumes_summoned: Number(s.costumes_summoned) };
}
