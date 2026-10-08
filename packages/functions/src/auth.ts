// Who is calling: the Supabase session from the wallet sign-in, mapped to the SpookPad user's wallet.
import { isAuthRetryableFetchError, type SupabaseClient, type UserResponse } from "@supabase/supabase-js";

// auth-js never throws on a network failure: getUser() resolves to { data: { user: null }, error: AuthRetryableFetchError }.
// Treat that (or any 0/5xx status) as a failure worth a 502-and-retry; anything else without a user is "not signed in".
export function userIdFromGetUserResult({ data, error }: UserResponse): string | null {
  if (error) {
    const status = error.status;
    if (isAuthRetryableFetchError(error) || status === 0 || (typeof status === "number" && status >= 500)) {
      throw new Error(`Couldn't verify the sign-in: ${error.message}`);
    }
  }
  return data.user?.id ?? null;
}

export async function walletFromToken(db: SupabaseClient, token: string): Promise<string | null> {
  const id = userIdFromGetUserResult(await db.auth.getUser(token));
  if (!id) return null;
  const { data, error } = await db.from("users").select("wallet").eq("id", id).maybeSingle();
  if (error) throw new Error(`users: ${error.message}`);
  return (data as { wallet: string } | null)?.wallet ?? null;
}
