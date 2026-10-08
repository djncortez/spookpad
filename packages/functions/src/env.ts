import { SOLANA_ADDRESS } from "@spookpad/core/admin-auth";

export type Env = Record<string, string | undefined>;

export function requireEnv(env: Env, ...names: string[]): Record<string, string> {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error(`Missing function secrets: ${missing.join(", ")}. Set them with: npx supabase secrets set NAME=value`);
  return Object.fromEntries(names.map((n) => [n, env[n] as string]));
}

// Supabase automatically provides SUPABASE_SERVICE_ROLE_KEY to every Edge Function on legacy-key
// projects. Newer projects that have switched to publishable/secret API keys don't set it at all;
// their service-role equivalent is the project's secret key (sb_secret_…), which must be set
// manually with `npx supabase secrets set SERVICE_KEY=sb_secret_...` (Supabase refuses to store any
// secret whose name starts with SUPABASE_, so the fallback can't be named SUPABASE_SECRET_KEY).
export function requireServiceKey(env: Env): string {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_KEY;
  if (!key) {
    throw new Error(
      "Missing function secret: SUPABASE_SERVICE_ROLE_KEY or SERVICE_KEY. " +
      "Set it with: npx supabase secrets set SERVICE_KEY=value",
    );
  }
  return key;
}

// A function secret that must hold a Solana address (e.g. TREASURY_ADDRESS): fail at startup, clearly.
export function requireSolanaAddress(value: string, name: string): string {
  if (!SOLANA_ADDRESS.test(value)) {
    throw new Error(`${name} must be a Solana address (base58). Set it with: npx supabase secrets set ${name}=<address>`);
  }
  return value;
}
