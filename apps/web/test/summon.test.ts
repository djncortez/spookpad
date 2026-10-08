import { describe, expect, test } from "vitest";
import type { Invoke } from "../lib/call";
import { finishPayment, summonCostume, type Generation } from "../lib/summon";

const gen = (state: Generation["state"], extra: Partial<Generation> = {}): Generation => ({
  id: "g1", draft_id: "d", costume: "ghost", state, original_path: "originals/g1.png", result_path: state === "ready" ? "costumes/g1.png" : null,
  error: null, attempts: 0, fee_lamports: 1_000_000, ...extra,
});
const startAnswer = (g: Generation) => ({ generation: g, fee_lamports: 1_000_000, treasury: "T", memo: "spookpad:g1" });

describe("summonCostume", () => {
  test("starts, pays the fee, waits for Solana, and returns the costume", async () => {
    const actions: string[] = [];
    const steps: string[] = [];
    const paid: unknown[] = [];
    const remembered: string[][] = [];
    let polls = 0;
    const invoke = (async (_name: string, body: { action: string }) => {
      actions.push(body.action);
      if (body.action === "start") return startAnswer(gen("awaiting_payment"));
      return ++polls < 3 ? { status: "waiting" } : { generation: gen("ready") };
    }) as Invoke;
    const g = await summonCostume({
      invoke, wait: async () => {}, onStep: (s) => steps.push(s), remember: (id, sig) => remembered.push([id, sig]),
      payFee: async (p) => { paid.push(p); return "SIG"; },
    }, { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
    expect(g.state).toBe("ready");
    expect(paid).toEqual([{ treasury: "T", lamports: 1_000_000, memo: "spookpad:g1" }]);
    expect(remembered).toEqual([["g1", "SIG"]]);
    expect(actions).toEqual(["start", "pay", "pay", "pay"]);
    expect(steps).toEqual(["uploading", "paying", "brewing"]);
  });

  test("a free costume comes back from start without a payment", async () => {
    const invoke = (async () => startAnswer(gen("ready"))) as Invoke;
    const g = await summonCostume({ invoke, wait: async () => {}, payFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
    expect(g.state).toBe("ready");
  });

  test("gives up waiting with a message that says no second payment is needed", async () => {
    const invoke = (async (_n: string, body: { action: string }) =>
      body.action === "start" ? startAnswer(gen("awaiting_payment")) : { status: "waiting" }) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, payFee: async () => "SIG" }, { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 }))
      .rejects.toThrow(/won't pay twice/);
  });

  test("remembers the payment before the poll that times out", async () => {
    const order: string[] = [];
    const invoke = (async (_n: string, body: { action: string }) => {
      if (body.action === "start") return startAnswer(gen("awaiting_payment"));
      order.push("pay-call");
      return { status: "waiting" };
    }) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, payFee: async () => "SIG", remember: () => { order.push("remember"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow(/won't pay twice/);
    expect(order[0]).toBe("remember");
  });

  test("refuses to sign when the memo does not name the generation", async () => {
    const invoke = (async () => ({ ...startAnswer(gen("awaiting_payment")), memo: "spookpad:other" })) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, payFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow(/nothing was sent/);
  });

  test("refuses to sign when the fee is not the one shown", async () => {
    const invoke = (async () => ({ ...startAnswer(gen("awaiting_payment")), fee_lamports: 9_000_000 })) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, payFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 })).rejects.toThrow(/nothing was sent/);
  });

  test("accepts a fee sent as a string and pays a number", async () => {
    const paid: unknown[] = [];
    const invoke = (async (_n: string, b: { action: string }) =>
      b.action === "start" ? { ...startAnswer(gen("awaiting_payment")), fee_lamports: "1000000" } : { generation: gen("ready") }) as Invoke;
    await summonCostume({ invoke, wait: async () => {}, payFee: async (p) => { paid.push(p); return "SIG"; } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA", feeLamports: 1_000_000 });
    expect(paid).toEqual([{ treasury: "T", lamports: 1_000_000, memo: "spookpad:g1" }]);
  });
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
