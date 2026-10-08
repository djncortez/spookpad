import { describe, expect, test } from "vitest";
import { SHARED_RULE } from "@spookpad/core/costumes";
import { toBase64 } from "@spookpad/core/encoding";
import { feeMemo, MEMO_PROGRAM_ID, SYSTEM_PROGRAM_ID, type ParsedTransaction } from "@spookpad/core/fee-check";
import type { Art } from "@spookpad/core/image-type";
import type { Rpc } from "@spookpad/core/rpc-types";
import { createCostumeHandler, type CostumeDeps } from "../src/costume";
import { StoreError } from "../src/errors";
import { AiRefused, type CostumeAi } from "../src/openrouter";
import type { GenerationRow } from "../src/store";

const ORIGIN = "http://localhost:3000";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const OTHER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TREASURY = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const DRAFT = "11111111-2222-4333-8444-555555555555";
const SIG = "62gVEr8pk9j2wvMXbTNNGYuriA1afWX3CitakYeUgfJYsC5fc89BBxsMeVLAUBEVGcPcezevVEPZ3kyB8o16Pw3z";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const COSTUME: Art = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]), type: "image/jpeg" };
const GEN1 = "00000000-0000-4000-8000-000000000001";

function feeTx(generationId: string, memo = feeMemo(generationId)): ParsedTransaction {
  return {
    meta: { err: null },
    transaction: {
      signatures: [SIG],
      message: {
        accountKeys: [{ pubkey: WALLET, signer: true }, { pubkey: TREASURY, signer: false }],
        instructions: [
          { programId: MEMO_PROGRAM_ID, parsed: memo },
          { programId: SYSTEM_PROGRAM_ID, parsed: { type: "transfer", info: { source: WALLET, destination: TREASURY, lamports: 1_000_000 } } },
        ],
      },
    },
  };
}

function setup(o: { fee?: number; tx?: (id: string) => ParsedTransaction | null; ai?: Partial<CostumeAi>; credits?: number | null; start?: () => never; begin?: true; expire?: () => Promise<string[]> } = {}) {
  const gens = new Map<string, GenerationRow & { stale?: boolean }>();
  const used = new Set<string>();
  const art = new Map<string, Art>();
  const log = { rpcCalls: [] as unknown[][], aiCalls: 0, alerts: [] as string[], prompts: [] as string[], removed: [] as string[], uploads: [] as string[], expireCalls: 0 };
  let n = 0;
  let paused = false;
  const deps: CostumeDeps = {
    origins: [ORIGIN],
    treasury: TREASURY,
    walletFromToken: async (t) => (t === "good" ? WALLET : t === "other" ? OTHER : null),
    startGeneration: async (g) => {
      if (o.start) o.start();
      const fee = o.fee ?? 1_000_000;
      const row: GenerationRow = {
        id: g.id, wallet: g.wallet, draft_id: g.draftId, costume: g.costume, original_path: g.originalPath, result_path: null,
        state: fee === 0 ? "paid" : "awaiting_payment", fee_lamports: fee, attempts: 0, error: null, metadata_key: null,
        metadata_uri: null, refunded_at: null, created_at: "2026-10-08T00:00:00Z",
      };
      gens.set(g.id, row);
      return { ...row };
    },
    loadGeneration: async (id) => (gens.has(id) ? { ...gens.get(id)! } : null),
    claimPayment: async (sig, id) => {
      if (used.has(sig)) throw new StoreError("payment_used");
      used.add(sig);
      const g = gens.get(id)!;
      g.state = "paid";
      return { ...g };
    },
    expireUnpaid: async () => { log.expireCalls++; return o.expire ? o.expire() : []; },
    beginAttempt: async (id) => {
      const g = gens.get(id)!;
      if (paused) throw new StoreError("paused");
      if (g.state !== "paid" && !(g.state === "generating" && g.stale)) throw new StoreError("not_paid");
      if (o.begin) { g.attempts = 3; const f = { ...g, state: "failed" as const }; gens.set(id, f); return { ...f }; }
      g.state = "generating";
      g.attempts++;
      return { ...g };
    },
    finishAttempt: async (id, path, error) => {
      const g = gens.get(id)!;
      g.state = path ? "ready" : g.attempts >= 3 ? "failed" : "paid";
      g.result_path = path ?? g.result_path;
      g.error = error;
      return { ...g };
    },
    loadCostumePrompt: async (slug) => (slug === "ghost" ? "a white bedsheet ghost costume" : null),
    uploadArt: async (p, a) => { art.set(p, a); log.uploads.push(p); },
    removeArt: async (p) => { log.removed.push(p); },
    downloadArt: async (p) => art.get(p)!,
    rpc: (async (method: string, params: unknown[]) => {
      if (method !== "getTransaction") throw new Error(method);
      log.rpcCalls.push(params);
      const sig = params[0] as string;
      return o.tx ? o.tx(sig) : feeTx(GEN1);
    }) as Rpc,
    ai: { edit: async (_a, prompt) => { log.aiCalls++; log.prompts.push(prompt); return COSTUME; }, credits: async () => (o.credits === undefined ? 10 : o.credits), ...o.ai },
    minCreditUsd: async () => 2,
    pauseForLowCredit: async () => { const first = !paused; paused = true; return first; },
    alert: async (t) => { log.alerts.push(t); },
    newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
  };
  const handler = createCostumeHandler(deps);
  const call = async (body: unknown, token: string | null = "good", method = "POST") => {
    const headers: Record<string, string> = { origin: ORIGIN, "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await handler(new Request("https://x/functions/v1/costume", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined }));
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const startOne = (costume = "ghost") => call({ action: "start", draft_id: DRAFT, costume, image: toBase64(PNG) });
  return { deps, call, startOne, gens, art, log, pause: (on: boolean) => { paused = on; } };
}

describe("costume: requests", () => {
  test("preflight, wrong method, no sign-in", async () => {
    const { call } = setup();
    expect((await call(null, "good", "OPTIONS")).status).toBe(204);
    expect((await call(null, "good", "GET")).status).toBe(405);
    expect(await call({ action: "start" }, null)).toEqual({ status: 401, body: { error: "Sign in with your wallet first." } });
    expect((await call({ action: "dance" })).status).toBe(400);
  });
});

describe("costume: start", () => {
  test("stores the original and asks for the fee with the generation's memo", async () => {
    const { startOne, art } = setup();
    const r = await startOne();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      generation: { id: GEN1, draft_id: DRAFT, costume: "ghost", state: "awaiting_payment", original_path: `originals/${GEN1}.png`,
        result_path: null, error: null, attempts: 0, fee_lamports: 1_000_000 },
      fee_lamports: 1_000_000, treasury: TREASURY, memo: feeMemo(GEN1),
    });
    expect(art.get(`originals/${GEN1}.png`)).toEqual({ bytes: PNG, type: "image/png" });
  });
  test("refuses bad images, drafts and costume names", async () => {
    const { call } = setup();
    expect(await call({ action: "start", draft_id: DRAFT, costume: "ghost", image: toBase64(new TextEncoder().encode("GIF89a......")) }))
      .toEqual({ status: 400, body: { error: "Pick a PNG, JPG or WebP image." } });
    expect((await call({ action: "start", draft_id: "x", costume: "ghost", image: toBase64(PNG) })).status).toBe(400);
    expect((await call({ action: "start", draft_id: DRAFT, costume: "Ghost!", image: toBase64(PNG) })).status).toBe(400);
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await call({ action: "start", draft_id: DRAFT, costume: "ghost", image: toBase64(big) })).body.error).toMatch(/too big/);
  });
  test("a refused start removes the uploaded original", async () => {
    const { startOne, log } = setup({ start: () => { throw new StoreError("paused"); } });
    expect(await startOne()).toEqual({ status: 409, body: { error: "Costume summoning is paused right now. Try again soon." } });
    expect(log.removed).toEqual([`originals/${GEN1}.png`]);
  });
  test("a free costume is summoned at once", async () => {
    const { startOne } = setup({ fee: 0 });
    const r = await startOne();
    expect(r.body.generation).toMatchObject({ state: "ready", result_path: `costumes/${GEN1}.jpg` });
  });
});

describe("costume: pay", () => {
  test("waits until the payment is on Solana", async () => {
    const { startOne, call } = setup({ tx: () => null });
    await startOne();
    expect(await call({ action: "pay", generation_id: GEN1, signature: SIG })).toEqual({ status: 202, body: { status: "waiting" } });
  });
  test("a good payment summons the costume with the shared rule + the costume line", async () => {
    const { startOne, call, log, art } = setup();
    await startOne();
    const r = await call({ action: "pay", generation_id: GEN1, signature: SIG });
    expect(r.status).toBe(200);
    expect(r.body.generation).toMatchObject({ state: "ready", result_path: `costumes/${GEN1}.jpg`, attempts: 1 });
    expect(log.prompts).toEqual([`${SHARED_RULE} a white bedsheet ghost costume.`]);
    expect(art.get(`costumes/${GEN1}.jpg`)).toEqual(COSTUME);
  });
  test("a payment for something else is refused", async () => {
    const { startOne, call } = setup({ tx: () => feeTx(GEN1, "spookpad:someone-else") });
    await startOne();
    expect(await call({ action: "pay", generation_id: GEN1, signature: SIG })).toEqual({ status: 400, body: { error: "That payment isn't for this costume." } });
  });
  test("a bad signature or someone else's costume is refused", async () => {
    const { startOne, call } = setup();
    await startOne();
    expect((await call({ action: "pay", generation_id: GEN1, signature: "nope" })).status).toBe(400);
    expect((await call({ action: "pay", generation_id: GEN1, signature: SIG }, "other")).status).toBe(404);
  });
  test("an AI refusal keeps the payment; the retry is free", async () => {
    let tries = 0;
    const { startOne, call } = setup({ ai: { edit: async () => { if (++tries === 1) throw new AiRefused("The AI didn't return a costume."); return COSTUME; } } });
    await startOne();
    const first = await call({ action: "pay", generation_id: GEN1, signature: SIG });
    expect(first.body.generation).toMatchObject({ state: "paid", error: "The AI didn't return a costume.", attempts: 1 });
    const second = await call({ action: "retry", generation_id: GEN1 });
    expect(second.body.generation).toMatchObject({ state: "ready", attempts: 2, error: null });
  });
  test("an unexpected AI error says the spell fizzled", async () => {
    const { startOne, call } = setup({ ai: { edit: async () => { throw new Error("OpenRouter: HTTP 500"); } } });
    await startOne();
    const r = await call({ action: "pay", generation_id: GEN1, signature: SIG });
    expect(r.body.generation.error).toBe("The costume spell fizzled. Try again — it's free.");
  });
  test("low AI credit pauses summoning and alerts the admin once", async () => {
    const { startOne, call, log } = setup({ credits: 1.5 });
    await startOne();
    await call({ action: "pay", generation_id: GEN1, signature: SIG });
    expect(log.alerts).toHaveLength(1);
    expect(log.alerts[0]).toMatch(/OpenRouter credit is down to \$1\.50/);
  });
  test("retrying a costume that isn't paid is refused", async () => {
    const { startOne, call } = setup();
    await startOne();
    expect(await call({ action: "retry", generation_id: GEN1 })).toEqual({
      status: 409, body: { error: "This costume isn't paid for yet, or is being summoned right now." },
    });
  });

  test("a stale third attempt comes back failed: no AI call, 409 no_attempts", async () => {
    const { startOne, call, log, gens } = setup({ begin: true });
    await startOne();
    gens.get(GEN1)!.state = "paid";
    const r = await call({ action: "retry", generation_id: GEN1 });
    expect(r).toEqual({ status: 409, body: { error: "This costume failed 3 times. The SpookPad team will refund your fee." } });
    expect(log.aiCalls).toBe(0);
  });
  test("low credit is checked when the AI attempt fails too: it pauses, alerts once, and the retry waits", async () => {
    const { startOne, call, log, gens } = setup({ credits: 1.5, ai: { edit: async () => { throw new Error("OpenRouter: HTTP 402"); } } });
    await startOne();
    const first = await call({ action: "pay", generation_id: GEN1, signature: SIG });
    expect(first.body.generation).toMatchObject({ state: "paid", attempts: 1 });
    const second = await call({ action: "retry", generation_id: GEN1 });
    expect(second).toEqual({ status: 409, body: { error: "Costume summoning is paused right now. Try again soon." } });
    expect(gens.get(GEN1)).toMatchObject({ state: "paid", attempts: 1 });
    expect(log.alerts).toHaveLength(1);
    expect(log.alerts[0]).toMatch(/OpenRouter credit is down to \$1\.50/);
  });
  test("a credit check that throws never turns a failed attempt into an error", async () => {
    const { startOne, call } = setup({ ai: { edit: async () => { throw new Error("boom"); }, credits: async () => { throw new Error("offline"); } } });
    await startOne();
    expect((await call({ action: "pay", generation_id: GEN1, signature: SIG })).status).toBe(200);
  });
  test("retrying a generation already failed answers the refund message, no AI call", async () => {
    const { startOne, call, log, gens } = setup();
    await startOne();
    gens.get(GEN1)!.state = "failed";
    expect(await call({ action: "retry", generation_id: GEN1 })).toEqual({
      status: 409, body: { error: "This costume failed 3 times. The SpookPad team will refund your fee." },
    });
    expect(log.aiCalls).toBe(0);
  });
  test("store refusals map to their answers", async () => {
    const limited = setup({ start: () => { throw new StoreError("rate_limited"); } });
    expect((await limited.startOne()).status).toBe(429);
    const bad = setup({ start: () => { throw new StoreError("bad_costume"); } });
    expect((await bad.startOne()).status).toBe(400);
    const used = setup();
    await used.startOne();
    used.deps.claimPayment = async () => { throw new StoreError("payment_used"); };
    expect((await used.call({ action: "pay", generation_id: GEN1, signature: SIG })).status).toBe(409);
  });
  test("another wallet retrying gets 404", async () => {
    const { startOne, call } = setup();
    await startOne();
    expect(await call({ action: "retry", generation_id: GEN1 }, "other")).toEqual({ status: 404, body: { error: "Costume not found." } });
  });
  test("the payment is checked against the fee frozen at start, and read at confirmed commitment", async () => {
    const { startOne, call, log, gens } = setup();
    await startOne();
    gens.get(GEN1)!.fee_lamports = 2_000_000; // the tx pays only 1_000_000
    const r = await call({ action: "pay", generation_id: GEN1, signature: SIG });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/doesn't send/);
    expect(log.rpcCalls[0]).toEqual([SIG, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
  });
});

describe("costume: final-review fixes", () => {
  test("start expires unpaid costumes first and removes their originals", async () => {
    const { startOne, log } = setup({ expire: async () => ["originals/old-1.png", "originals/old-2.webp"] });
    expect((await startOne()).status).toBe(200);
    expect(log.expireCalls).toBe(1);
    expect(log.removed).toEqual(["originals/old-1.png", "originals/old-2.webp"]);
  });
  test("a failing expiry never fails the start", async () => {
    const { startOne, log } = setup({ expire: async () => { throw new Error("db down"); } });
    expect((await startOne()).status).toBe(200);
    expect(log.removed).toEqual([]);
  });
  test("a failing removal never fails the start", async () => {
    const t = setup({ expire: async () => ["originals/old-1.png"] });
    t.deps.removeArt = async () => { throw new Error("storage down"); };
    expect((await t.startOne()).status).toBe(200);
  });
  test("paying for an expired costume answers that it expired", async () => {
    const { startOne, call, gens } = setup();
    await startOne();
    gens.get(GEN1)!.state = "expired";
    expect(await call({ action: "pay", generation_id: GEN1, signature: SIG })).toEqual({
      status: 409, body: { error: "This costume wasn't paid for within an hour, so it expired. Summon it again." },
    });
  });
  test("while summoning is paused, a payment is kept but no AI attempt starts; the retry works after unpausing", async () => {
    const { startOne, call, log, gens, pause } = setup();
    await startOne();
    pause(true);
    expect(await call({ action: "pay", generation_id: GEN1, signature: SIG })).toEqual({
      status: 409, body: { error: "Costume summoning is paused right now. Try again soon." },
    });
    expect(gens.get(GEN1)!.state).toBe("paid");
    expect(await call({ action: "retry", generation_id: GEN1 })).toMatchObject({ status: 409 });
    expect(log.aiCalls).toBe(0);
    pause(false);
    expect((await call({ action: "retry", generation_id: GEN1 })).body.generation).toMatchObject({ state: "ready", attempts: 1 });
  });
  test("a stuck 'generating' costume can be retried (the takeover happens in begin_attempt)", async () => {
    const { startOne, call, gens } = setup();
    await startOne();
    Object.assign(gens.get(GEN1)!, { state: "generating", attempts: 1, stale: true });
    const r = await call({ action: "retry", generation_id: GEN1 });
    expect(r.body.generation).toMatchObject({ state: "ready", attempts: 2 });
  });
});
