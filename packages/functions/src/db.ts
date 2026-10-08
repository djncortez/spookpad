import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Only Edge Functions hold this key.
export const serviceClient = (url: string, key: string): SupabaseClient =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
