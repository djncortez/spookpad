// POST /functions/v1/costume  (Authorization: Bearer <Supabase access token>)  (spec §4.1)
//   { action: "start", draft_id, costume, image }   image: base64 PNG / JPEG / WebP, at most 3 MB
//      -> 200 { generation, fee_lamports, treasury, memo }   pay the fee with that memo, then "pay". A free costume
//         (fee 0) is summoned at once and comes back ready.
//   { action: "pay", generation_id, signature }
//      -> 202 { status: "waiting" }   the payment isn't on Solana yet: ask again in 2 s
//      -> 200 { generation }          paid and summoned ("ready"), or the AI failed ("paid" + error: the retry is free;
//                                     "failed" after 3 attempts, refunded by the admin)
//      -> 409 { error }               also when the costume expired (unpaid for an hour): a valid payment that still
//                                     lands for it is recorded and refunded by the admin (state "failed", error
//                                     "expired_paid"); the answer says so, and the browser treats it as resolved
//   { action: "retry", generation_id } -> 200 { generation }   also takes over an attempt stuck "generating" for 3 minutes
// While summoning is paused (admin or low AI credit) pay and retry answer 409 "paused" and start no AI attempt; a paid
// costume stays paid, so the free retry works once summoning is back.
import { buildPrompt, COSTUME_SLUG } from "@spookpad/core/costumes";
import { fromBase64 } from "@spookpad/core/encoding";
import { checkFeePayment, feeMemo, type ParsedTransaction } from "@spookpad/core/fee-check";
import { EXT, MAX_ORIGINAL_BYTES, sniffImageType, type Art } from "@spookpad/core/image-type";
import type { Rpc } from "@spookpad/core/rpc-types";
import { StoreError } from "./errors";
import { bearer, corsHeaders, json } from "./http";
import { AiRefused, type CostumeAi } from "./openrouter";
import type { GenerationRow } from "./store";

export interface CostumeDeps {
  origins: string[];
  treasury: string;
  walletFromToken(token: string): Promise<string | null>;
  startGeneration(g: { id: string; wallet: string; draftId: string; costume: string; originalPath: string }): Promise<GenerationRow>;
  loadGeneration(id: string): Promise<GenerationRow | null>;
  claimPayment(signature: string, generationId: string, wallet: string, lamports: number): Promise<GenerationRow>;
  claimExpiredPayment(signature: string, generationId: string, wallet: string, lamports: number): Promise<GenerationRow>;
  expireUnpaid(): Promise<string[]>; // marks costumes unpaid for an hour expired; returns their originals' paths
  beginAttempt(id: string, wallet: string): Promise<GenerationRow>;
  finishAttempt(id: string, resultPath: string | null, error: string | null): Promise<GenerationRow>;
  loadCostumePrompt(slug: string): Promise<string | null>;
  uploadArt(path: string, art: Art): Promise<void>;
  removeArt(path: string): Promise<void>;
  downloadArt(path: string): Promise<Art>;
  rpc: Rpc;
  ai: CostumeAi;
  minCreditUsd(): Promise<number>;
  pauseForLowCredit(): Promise<boolean>;
  alert(text: string): Promise<void>;
  newId(): string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const EXPIRED = "This costume wasn't paid for within an hour, so it expired. Summon it again.";
const EXPIRED_PAID = "Your payment arrived after this costume expired, so it can't be summoned. The SpookPad team will refund your fee.";
const FIZZLED = "The costume spell fizzled. Try again — it's free.";
const STORE_ANSWERS: Record<string, [number, string]> = {
  paused: [409, "Costume summoning is paused right now. Try again soon."],
  bad_costume: [400, "Pick one of the costumes."],
  rate_limited: [429, "That's a lot of costumes! Wait a while before summoning more."],
  not_found: [404, "Costume not found."],
  not_awaiting: [409, "This costume is already paid for."],
  payment_used: [409, "This payment was already used for another costume."],
  not_paid: [409, "This costume isn't paid for yet, or is being summoned right now."],
  no_attempts: [409, "This costume failed 3 times. The SpookPad team will refund your fee."],
  not_generating: [409, "This costume is being summoned right now."],
};

export const publicGeneration = (g: GenerationRow) => ({
  id: g.id, draft_id: g.draft_id, costume: g.costume, state: g.state, original_path: g.original_path,
  result_path: g.result_path, error: g.error, attempts: g.attempts, fee_lamports: g.fee_lamports,
});

async function checkCredit(d: CostumeDeps): Promise<void> {
  try {
    const left = await d.ai.credits();
    if (left === null) return;
    const min = await d.minCreditUsd();
    if (left < min && (await d.pauseForLowCredit())) {
      await d.alert(`SpookPad: OpenRouter credit is down to $${left.toFixed(2)} (minimum $${min}). Costume summoning is paused. ` +
        "Top up OpenRouter, then unpause on the admin page.");
    }
  } catch (e) {
    console.error("costume: credit check failed", e);
  }
}

// One AI attempt. An AI failure never throws: the generation goes back to "paid" (or "failed" after 3 attempts).
async function summon(d: CostumeDeps, g: GenerationRow): Promise<GenerationRow> {
  const running = await d.beginAttempt(g.id, g.wallet);
  // A stale third attempt comes back already marked failed (refundable): no AI call.
  if (running.state === "failed") throw new StoreError("no_attempts");
  let done: GenerationRow;
  try {
    const prompt = await d.loadCostumePrompt(running.costume);
    if (!prompt) throw new AiRefused("This costume isn't available any more. Pick another one.");
    const costume = await d.ai.edit(await d.downloadArt(running.original_path), buildPrompt(prompt));
    const path = `costumes/${running.id}.${EXT[costume.type]}`;
    await d.uploadArt(path, costume);
    done = await d.finishAttempt(running.id, path, null);
  } catch (e) {
    console.error("costume: attempt failed", e);
    const failed = await d.finishAttempt(running.id, null, e instanceof AiRefused ? e.message : FIZZLED);
    await checkCredit(d); // an empty OpenRouter account fails every attempt: this is where the pause has to fire
    return failed;
  }
  await checkCredit(d);
  return done;
}

// Best effort, never fails the request: expire costumes left unpaid for an hour and delete their originals (each start
// uploads up to 3 MB to the public bucket before any payment).
async function expireUnpaid(d: CostumeDeps): Promise<void> {
  let paths: string[];
  try {
    paths = await d.expireUnpaid();
  } catch (e) {
    console.error("costume: expiring unpaid costumes failed", e);
    return;
  }
  await Promise.all(paths.map((p) => d.removeArt(p).catch((e) => console.error("costume: removing an expired original failed", p, e))));
}

async function start(d: CostumeDeps, wallet: string, body: Record<string, unknown>, cors: Record<string, string>): Promise<Response> {
  const fail = (status: number, error: string) => json({ error }, status, cors);
  const draftId = typeof body.draft_id === "string" && UUID.test(body.draft_id) ? body.draft_id : null;
  if (!draftId) return fail(400, "Something's off with this page. Reload it and try again.");
  const costume = typeof body.costume === "string" && COSTUME_SLUG.test(body.costume) ? body.costume : null;
  if (!costume) return fail(400, "Pick one of the costumes.");
  let bytes: Uint8Array;
  try { bytes = fromBase64(String(body.image ?? "")); } catch { return fail(400, "Pick a PNG, JPG or WebP image."); }
  const type = sniffImageType(bytes);
  if (!type) return fail(400, "Pick a PNG, JPG or WebP image.");
  if (bytes.length > MAX_ORIGINAL_BYTES) return fail(400, "That image is too big. Pick one under 3 MB.");

  await expireUnpaid(d);
  const id = d.newId();
  const path = `originals/${id}.${EXT[type]}`;
  await d.uploadArt(path, { bytes, type });
  let g: GenerationRow;
  try {
    g = await d.startGeneration({ id, wallet, draftId, costume, originalPath: path });
  } catch (e) {
    await d.removeArt(path).catch(() => {});
    throw e;
  }
  if (g.state === "paid") g = await summon(d, g); // a free costume
  return json({ generation: publicGeneration(g), fee_lamports: g.fee_lamports, treasury: d.treasury, memo: feeMemo(g.id) }, 200, cors);
}

async function pay(d: CostumeDeps, wallet: string, body: Record<string, unknown>, cors: Record<string, string>): Promise<Response> {
  const fail = (status: number, error: string) => json({ error }, status, cors);
  const id = typeof body.generation_id === "string" && UUID.test(body.generation_id) ? body.generation_id : null;
  const signature = typeof body.signature === "string" && SIGNATURE.test(body.signature) ? body.signature : null;
  if (!id || !signature) return fail(400, "That isn't a Solana payment.");
  const g = await d.loadGeneration(id);
  if (!g || g.wallet !== wallet) return fail(404, "Costume not found.");
  if (g.state === "failed" && g.error === "expired_paid") return fail(409, EXPIRED_PAID);
  if (g.state !== "awaiting_payment" && g.state !== "expired") return json({ generation: publicGeneration(g) }, 200, cors);

  let tx: ParsedTransaction | null;
  try {
    tx = await d.rpc<ParsedTransaction | null>("getTransaction", [
      signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]);
  } catch (e) {
    console.error("costume: RPC failed", e);
    return fail(502, "Couldn't read the payment from Solana right now. Try again in a minute.");
  }
  if (!tx) return json({ status: "waiting" }, 202, cors);
  const problem = checkFeePayment(tx, { wallet, treasury: d.treasury, lamports: g.fee_lamports, memo: feeMemo(g.id) });
  if (problem) {
    if (g.state === "expired") return fail(409, EXPIRED);
    return fail(400, problem);
  }
  // A real payment for an expired costume (it landed, but was never claimed before expire_unpaid ran): its original is
  // gone, so record it for a refund instead of losing it.
  const claimExpired = async () => {
    try {
      await d.claimExpiredPayment(signature, g.id, wallet, g.fee_lamports);
    } catch (e) {
      // a concurrent duplicate already recorded it
      const now = e instanceof StoreError && e.code === "not_awaiting" ? await d.loadGeneration(g.id) : null;
      if (!(now?.state === "failed" && now.error === "expired_paid")) throw e;
    }
    return fail(409, EXPIRED_PAID);
  };
  if (g.state === "expired") return claimExpired();
  let paid: GenerationRow;
  try {
    paid = await d.claimPayment(signature, g.id, wallet, g.fee_lamports);
  } catch (e) {
    // expired between the read above and the claim
    if (e instanceof StoreError && e.code === "not_awaiting" && (await d.loadGeneration(g.id))?.state === "expired") return claimExpired();
    throw e;
  }
  return json({ generation: publicGeneration(await summon(d, paid)) }, 200, cors);
}

async function retry(d: CostumeDeps, wallet: string, body: Record<string, unknown>, cors: Record<string, string>): Promise<Response> {
  const id = typeof body.generation_id === "string" && UUID.test(body.generation_id) ? body.generation_id : null;
  const g = id ? await d.loadGeneration(id) : null;
  if (!g || g.wallet !== wallet) return json({ error: "Costume not found." }, 404, cors);
  if (g.state === "ready") return json({ generation: publicGeneration(g) }, 200, cors);
  if (g.state === "failed" && g.error === "expired_paid") return json({ error: EXPIRED_PAID }, 409, cors);
  if (g.state === "failed") return json({ error: STORE_ANSWERS.no_attempts[1] }, STORE_ANSWERS.no_attempts[0], cors);
  return json({ generation: publicGeneration(await summon(d, g)) }, 200, cors);
}

export function createCostumeHandler(d: CostumeDeps) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, d.origins);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
    const fail = (status: number, error: string) => json({ error }, status, cors);
    try {
      const token = bearer(req);
      let wallet: string | null = null;
      if (token) {
        try {
          wallet = await d.walletFromToken(token);
        } catch (e) {
          console.error("costume: couldn't check the sign-in", e);
          return fail(502, "Couldn't check your sign-in right now. Try again in a minute.");
        }
      }
      if (!wallet) return fail(401, "Sign in with your wallet first.");
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (body?.action === "start") return await start(d, wallet, body, cors);
      if (body?.action === "pay") return await pay(d, wallet, body, cors);
      if (body?.action === "retry") return await retry(d, wallet, body, cors);
      return fail(400, "Unknown action.");
    } catch (e) {
      if (e instanceof StoreError && STORE_ANSWERS[e.code]) return fail(...STORE_ANSWERS[e.code]);
      console.error("costume failed", e);
      return fail(500, "Something went wrong. Try again in a minute.");
    }
  };
}
