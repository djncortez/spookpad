import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./env";

let client: SupabaseClient | null = null;

// Created on first use (not at import) so the static build works without Supabase settings.
export function supabase(): SupabaseClient {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.");
  }
  return (client ??= createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey));
}
