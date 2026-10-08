// Summoning a costume (spec §2 step 4): upload the mascot, pay the costume fee from the wallet, then ask the costume
// function to check the payment; that same call runs the AI, so the answer is the finished costume.
import { feeMemo } from "@spookpad/core/fee-check";
import type { Invoke } from "./call";

export type GenerationState = "awaiting_payment" | "paid" | "generating" | "ready" | "failed";
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
  launched?: boolean;
}
export type SummonStep = "uploading" | "paying" | "brewing";
export interface SummonDeps {
  invoke: Invoke;
  payFee(p: { treasury: string; lamports: number; memo: string }): Promise<string>; // the payment's signature
  wait(ms: number): Promise<void>;
  onStep?(s: SummonStep): void;
  remember?(generationId: string, signature: string): void; // so a reload can check the payment again
}

const POLL_MS = 2000;
const POLL_TRIES = 45; // about 90 seconds

export async function summonCostume(d: SummonDeps, p: { draftId: string; costume: string; imageBase64: string; feeLamports: number }): Promise<Generation> {
  d.onStep?.("uploading");
  const start = await d.invoke<{ generation: Generation; fee_lamports: number; treasury: string; memo: string }>("costume", {
    action: "start", draft_id: p.draftId, costume: p.costume, image: p.imageBase64,
  });
  if (start.generation.state !== "awaiting_payment") return start.generation; // a free costume
  // Never sign what the server did not promise: the memo must name this generation and the fee must be the one shown.
  const lamports = Number(start.fee_lamports);
  if (start.memo !== feeMemo(start.generation.id)) throw new Error("The payment details didn't match this costume, so nothing was sent. Try again.");
  if (!Number.isSafeInteger(lamports) || lamports <= 0 || lamports !== p.feeLamports) {
    throw new Error("The costume fee changed from the one shown, so nothing was sent. Reload the page and try again.");
  }
  d.onStep?.("paying");
  const signature = await d.payFee({ treasury: start.treasury, lamports, memo: start.memo });
  d.remember?.(start.generation.id, signature);
  return finishPayment(d, start.generation.id, signature);
}

// After the fee is sent: wait until Solana shows it; the same call then summons the costume.
export async function finishPayment(d: Omit<SummonDeps, "payFee">, generationId: string, signature: string): Promise<Generation> {
  d.onStep?.("brewing");
  for (let i = 0; i < POLL_TRIES; i++) {
    const r = await d.invoke<{ generation: Generation } | { status: "waiting" }>("costume", { action: "pay", generation_id: generationId, signature });
    if ("generation" in r) return r.generation;
    await d.wait(POLL_MS);
  }
  throw new Error("Your payment was sent but hasn't confirmed yet. Press “Check payment” in a minute — you won't pay twice.");
}

export const retryCostume = async (invoke: Invoke, generationId: string): Promise<Generation> =>
  (await invoke<{ generation: Generation }>("costume", { action: "retry", generation_id: generationId })).generation;
