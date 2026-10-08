// NEXT_PUBLIC_* values are inlined at build time; each must be referenced literally for Next to replace it.
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
};
