// Error codes the SQL functions raise (supabase/migrations/0001_spookpad.sql). Handlers turn them into answers.
export const STORE_CODES = new Set([
  "paused", "bad_costume", "rate_limited", "not_found", "not_awaiting", "payment_used", "not_paid", "no_attempts",
  "not_generating", "not_ready", "already_launched", "mint_used", "not_refundable", "signature_used",
]);

export class StoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "StoreError";
  }
}
