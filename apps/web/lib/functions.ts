import { FunctionsHttpError } from "@supabase/supabase-js";

// An error answer from an Edge Function; status is the HTTP status when there was one.
export class ApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

// SpookPad's Edge Functions answer errors as { error: "<text for people>" }; show that text when there is one.
export async function functionErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = (await err.context.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) return body.error;
    } catch {
      // not JSON: use the fallback
    }
  }
  return fallback;
}

export const functionErrorStatus = (err: unknown): number | undefined =>
  err instanceof FunctionsHttpError ? (err.context as Response).status : undefined;
