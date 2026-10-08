import { describe, expect, test } from "vitest";
import type { Invoke } from "../lib/call";
import { summonCostume, type Generation } from "../lib/summon";

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
    }, { draftId: "d", costume: "ghost", imageBase64: "AAAA" });
    expect(g.state).toBe("ready");
    expect(paid).toEqual([{ treasury: "T", lamports: 1_000_000, memo: "spookpad:g1" }]);
    expect(remembered).toEqual([["g1", "SIG"]]);
    expect(actions).toEqual(["start", "pay", "pay", "pay"]);
    expect(steps).toEqual(["uploading", "paying", "brewing"]);
  });

  test("a free costume comes back from start without a payment", async () => {
    const invoke = (async () => startAnswer(gen("ready"))) as Invoke;
    const g = await summonCostume({ invoke, wait: async () => {}, payFee: async () => { throw new Error("must not pay"); } },
      { draftId: "d", costume: "ghost", imageBase64: "AAAA" });
    expect(g.state).toBe("ready");
  });

  test("gives up waiting with a message that says no second payment is needed", async () => {
    const invoke = (async (_n: string, body: { action: string }) =>
      body.action === "start" ? startAnswer(gen("awaiting_payment")) : { status: "waiting" }) as Invoke;
    await expect(summonCostume({ invoke, wait: async () => {}, payFee: async () => "SIG" }, { draftId: "d", costume: "ghost", imageBase64: "AAAA" }))
      .rejects.toThrow(/won't pay twice/);
  });
});
