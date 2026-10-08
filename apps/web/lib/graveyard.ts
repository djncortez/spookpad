// Launched coins, read from the public v_graveyard view.
import { supabase } from "./supabase";

export interface GraveCoin {
  mint: string;
  name: string;
  ticker: string;
  description: string;
  twitter: string | null;
  telegram: string | null;
  wallet: string;
  launched_at: string;
  costume: string;
  original_path: string;
  result_path: string;
}

export async function fetchGraveyard(limit = 60): Promise<GraveCoin[]> {
  const { data, error } = await supabase().from("v_graveyard").select("*").order("launched_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Couldn't load the Graveyard. Reload the page.");
  return data as GraveCoin[];
}

export async function fetchCoin(mint: string): Promise<GraveCoin | null> {
  const { data, error } = await supabase().from("v_graveyard").select("*").eq("mint", mint).maybeSingle();
  if (error) throw new Error("Couldn't load this coin. Reload the page.");
  return data as GraveCoin | null;
}

export function sortCoins(coins: GraveCoin[], caps: Record<string, number>, by: "new" | "cap"): GraveCoin[] {
  const list = [...coins];
  if (by === "new") return list.sort((a, b) => Date.parse(b.launched_at) - Date.parse(a.launched_at));
  return list.sort((a, b) => (caps[b.mint] ?? -1) - (caps[a.mint] ?? -1));
}
