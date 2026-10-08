import { describe, expect, test } from "vitest";
import type { Invoke } from "../lib/call";
import { ApiError } from "../lib/functions";
import { checkPending, StillWaiting } from "../lib/pending";
import { finishPayment, summonCostume, type Generation } from "../lib/summon";

const gen = (state: Generation["state"], extra: Partial<Generation> = {}): Generation => ({
  id: "g1", draft_id: "d", costume: "ghost", state, original_path: "originals/g1.png", result_path: state === "ready" ? "costumes/g1.png" : null,
  error: null, attempts: 0, fee_lamports: 1_000_000, ...extra,
});
const EXP = { blockhash: "BH", lastValidBlockHeight: 10 };
const fee = (signature = "SIG", send: () => Promise<void> = async () => {}) => async () => ({ signature, expiry: EXP, send });
const startAnswer = (g: Generation) => ({ generation: g, fee_lamports: 1_000_000, treasury: "T", memo: "spookpad:g1" });

describe("summonCostume", () => {
  test("starts, pays the fee, waits for Solana, and returns the costume", async () => {
    const actions: string[] = [];
    const steps: string[] = [];
    const paid: unknown[] = [];
    const remembered: unknown[][] = [];
    let polls = 0;
    const invoke = (async (_name: string, body: { action: string }) => {
      actions.push(body.action);
      if (body.action === "start") return startAnswer(gen("awaiting_payment"));
      return ++polls < 3 ? { status: "waiting" } : { generation: gen("ready") };
    }) as Invoke;
    const g = await summonCostume({
      invoke, wait: async () => {}, onStep: (s) => steps.push(s), remember: (id, sig, exp) => remembered.push([id, sig, exp.blockhash]),
      prepareFee: async (p) => { paid.push(p); return { signature: "SIG", expiry: EXP, send: async () => {} }; },
    }, { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
    expect(g.state).toBe("ready");
    expect(paid).toEqual([{ treasury: "T", lamports: 1_000_000, memo: "spookpad:g1" }]);
    expect(remembered).toEqual([["g1", "SIG", "BH"]]);
    expect(actions).toEqual(["start", "pay", "pay", "pay"]);
    expect(steps).toEqual(["uploading", "paying", "brewing"]);
  });

  test("a free costume comes back from start without a payment", async () => {
    const invoke = (async () => startAnswer(gen("ready"))) as Invoke;
    const g = await summonCostume({ invoke, wait: async () => {}, prepareFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
    expect(g.state).toBe("ready");
  });

  test("gives up waiting with a message that says no second payment is needed", async () => {
    const invoke = (async (_n: string, body: { action: string }) =>
      body.action === "start" ? startAnswer(gen("awaiting_payment")) : { status: "waiting" }) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, prepareFee: fee() }, { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 }))
      .rejects.toBeInstanceOf(StillWaiting);
  });

  test("remembers the payment before the poll that times out", async () => {
    const order: string[] = [];
    const invoke = (async (_n: string, body: { action: string }) => {
      if (body.action === "start") return startAnswer(gen("awaiting_payment"));
      order.push("pay-call");
      return { status: "waiting" };
    }) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, prepareFee: fee(), remember: () => { order.push("remember"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow(/won't pay twice/);
    expect(order[0]).toBe("remember");
  });

  test("refuses to sign when the memo does not name the generation", async () => {
    const invoke = (async () => ({ ...startAnswer(gen("awaiting_payment")), memo: "spookpad:other" })) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, prepareFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow(/nothing was sent/);
  });

  test("refuses to sign when the fee is not the one shown", async () => {
    const invoke = (async () => ({ ...startAnswer(gen("awaiting_payment")), fee_lamports: 9_000_000 })) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, prepareFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow(/nothing was sent/);
  });

  test("accepts a fee sent as a string and pays a number", async () => {
    const paid: unknown[] = [];
    const invoke = (async (_n: string, b: { action: string }) =>
      b.action === "start" ? { ...startAnswer(gen("awaiting_payment")), fee_lamports: "1000000" } : { generation: gen("ready") }) as Invoke;
    await summonCostume({ invoke, wait: async () => {}, prepareFee: async (p) => { paid.push(p); return fee()(); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
    expect(paid).toEqual([{ treasury: "T", lamports: 1_000_000, memo: "spookpad:g1" }]);
  });
});

test("the signature is remembered before the fee is sent", async () => {
  const order: string[] = [];
  const invoke = (async (_n: string, b: { action: string }) =>
    b.action === "start" ? startAnswer(gen("awaiting_payment")) : { generation: gen("ready") }) as Invoke;
  await summonCostume({
    invoke, wait: async () => {}, remember: () => { order.push("remember"); },
    prepareFee: fee("SIG", async () => { order.push("send"); }),
  }, { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
  expect(order).toEqual(["remember", "send"]);
});

test("nothing is remembered or sent when the wallet refuses to sign the fee", async () => {
  const order: string[] = [];
  const invoke = (async () => startAnswer(gen("awaiting_payment"))) as Invoke;
  await expect(summonCostume({
    invoke, wait: async () => {}, remember: () => { order.push("remember"); },
    prepareFee: async () => { throw new Error("rejected"); },
  }, { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow("rejected");
  expect(order).toEqual([]);
});

describe("finishPayment", () => {
  test("resuming with a stored signature makes no start call and no payment", async () => {
    const calls: { action: string; signature?: string }[] = [];
    const invoke = (async (_n: string, body: { action: string; signature?: string }) => {
      calls.push(body);
      return { generation: gen("ready") };
    }) as Invoke;
    const g = await finishPayment({ invoke, wait: async () => {} }, "g1", "SIG");
    expect(g.state).toBe("ready");
    expect(calls).toEqual([{ action: "pay", generation_id: "g1", signature: "SIG" }]);
  });
});

describe("checkPending", () => {
  const chain = (status: { err: unknown } | null, valid: boolean) => ({
    getSignatureStatuses: async () => ({ value: [status] }),
    isBlockhashValid: async () => ({ value: valid }),
  });
  const waiting = async () => { throw new StillWaiting("slow"); };
  const run = (e: () => Promise<unknown>, c: ReturnType<typeof chain>) => checkPending(e, c, "SIG", EXP, "gone");

  test("success is done", async () => {
    expect(await run(async () => 7, chain(null, true))).toEqual({ kind: "done", value: 7 });
  });
  test("a definitive 400, 404 or 409 clears with the server message", async () => {
    for (const status of [400, 404, 409]) {
      expect(await run(async () => { throw new ApiError("nope", status); }, chain(null, true))).toEqual({ kind: "cleared", message: "nope" });
    }
  });
  test("a 5xx or network error is not definitive and is rethrown", async () => {
    await expect(run(async () => { throw new ApiError("down", 503); }, chain(null, false))).rejects.toThrow("down");
    await expect(run(async () => { throw new Error("offline"); }, chain(null, false))).rejects.toThrow("offline");
  });
  test("still waiting with no status and an expired blockhash clears", async () => {
    expect(await run(waiting, chain(null, false))).toEqual({ kind: "cleared", message: "gone" });
  });
  test("still waiting with no status but a valid blockhash keeps", async () => {
    expect(await run(waiting, chain(null, true))).toEqual({ kind: "keep" });
  });
  test("still waiting with a status and no error keeps, even if the blockhash expired", async () => {
    expect(await run(waiting, chain({ err: null }, false))).toEqual({ kind: "keep" });
  });
  test("a transaction that failed on chain can never land and clears", async () => {
    expect(await run(waiting, chain({ err: { InstructionError: [0, "x"] } }, true))).toEqual({ kind: "cleared", message: "gone" });
  });
});
