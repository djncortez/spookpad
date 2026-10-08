// Summoning a costume (spec §2 step 4): upload the mascot, pay the costume fee from the wallet, then ask the costume
// function to check the payment; that same call runs the AI, so the answer is the finished costume.
import { feeMemo } from "@spookpad/core/fee-check";
import type { Invoke } from "./call";
import { StillWaiting, type Expiry } from "./pending";

export type GenerationState = "awaiting_payment" | "paid" | "generating" | "ready" | "failed" | "expired";
export interface Generation {
  id: string;
  draft_id: string;
  costume: string;
  state: GenerationState;
  original_path: string;
  result_path: string | null;
  error: string | null;
  attempts: number;
  fee_lamports: number;
  updated_at?: string; // v_my_generations: when the row last changed (the 3-minute takeover clock of begin_attempt)
  launched?: boolean;
}

// An AI attempt whose Edge Function died leaves the costume "generating"; after 3 minutes without a change the server
// lets the free retry take it over (begin_attempt). Milliseconds until then (0 = can be retried now; null = not stuck).
export const STUCK_MS = 3 * 60_000;
export function msUntilRetryable(g: Pick<Generation, "state" | "updated_at">, now: number): number | null {
  if (g.state !== "generating" || !g.updated_at) return null;
  const at = Date.parse(g.updated_at);
  return Number.isFinite(at) ? Math.max(0, at + STUCK_MS - now) : null;
}
export type SummonStep = "uploading" | "paying" | "brewing";
export interface SummonDeps {
  invoke: Invoke;
  // The wallet signs the fee but nothing is sent yet: the signature is known first, remembered, and only then sent.
  prepareFee(p: { treasury: string; lamports: number; memo: string }): Promise<{ signature: string; expiry: Expiry; send(): Promise<void> }>;
  wait(ms: number): Promise<void>;
  onStep?(s: SummonStep): void;
  remember?(generationId: string, signature: string, expiry: Expiry): void; // so a reload can check the payment again
}

const POLL_MS = 2000;
const POLL_TRIES = 45; // about 90 seconds

// p.treasury is SpookPad's treasury as configured in the site (NEXT_PUBLIC_TREASURY_ADDRESS): the fee is never paid
// anywhere else, whatever the server answers.
export async function summonCostume(d: SummonDeps, p: { draftId: string; costume: string; imageBase64: string; feeLamports: number; treasury: string }): Promise<Generation> {
  // Checked before start: without it no fee could ever be paid, so nothing is uploaded and no costume row is made.
  if (!p.treasury) throw new Error("SpookPad's treasury address isn't set up on this site, so costumes can't be summoned yet.");
  d.onStep?.("uploading");
  const start = await d.invoke<{ generation: Generation; fee_lamports: number; treasury: string; memo: string }>("costume", {
    action: "start", draft_id: p.draftId, costume: p.costume, image: p.imageBase64,
  });
  if (start.generation.state !== "awaiting_payment") return start.generation; // a free costume
  // Never sign what the server did not promise: the memo must name this generation and the fee must be the one shown.
  const lamports = Number(start.fee_lamports);
  if (start.treasury !== p.treasury) {
    throw new Error("The costume fee would go to a wallet that isn't SpookPad's treasury, so nothing was sent.");
  }
  if (start.memo !== feeMemo(start.generation.id)) throw new Error("The payment details didn't match this costume, so nothing was sent. Try again.");
  if (!Number.isSafeInteger(lamports) || lamports <= 0 || lamports !== p.feeLamports) {
    throw new Error("The costume fee changed from the one shown, so nothing was sent. Reload the page and try again.");
  }
  d.onStep?.("paying");
  const fee = await d.prepareFee({ treasury: start.treasury, lamports, memo: start.memo });
  d.remember?.(start.generation.id, fee.signature, fee.expiry); // before the send, so a crash or reload can never pay twice
  await fee.send();
  return finishPayment(d, start.generation.id, fee.signature);
}

// After the fee is sent: wait until Solana shows it; the same call then summons the costume.
export async function finishPayment(d: Omit<SummonDeps, "prepareFee">, generationId: string, signature: string): Promise<Generation> {
  d.onStep?.("brewing");
  for (let i = 0; i < POLL_TRIES; i++) {
    const r = await d.invoke<{ generation: Generation } | { status: "waiting" }>("costume", { action: "pay", generation_id: generationId, signature });
    if ("generation" in r) return r.generation;
    await d.wait(POLL_MS);
  }
  throw new StillWaiting("Your payment was sent but hasn't confirmed yet. Press “Check payment” in a minute — you won't pay twice.");
}

export const retryCostume = async (invoke: Invoke, generationId: string): Promise<Generation> =>
  (await invoke<{ generation: Generation }>("costume", { action: "retry", generation_id: generationId })).generation;
