import { describe, expect, test } from "vitest";
import { buildPrompt, checkCostumePatch, COSTUME_SLUG, DEFAULT_COSTUME, SEED_COSTUMES, SHARED_RULE } from "../src/costumes";

describe("costumes", () => {
  test("seven seed costumes, ghost first", () => {
    expect(SEED_COSTUMES.map((c) => c.slug)).toEqual(["ghost", "witch", "vampire", "pumpkin", "mummy", "skeleton", "devil"]);
    expect(DEFAULT_COSTUME).toBe("ghost");
    for (const c of SEED_COSTUMES) expect(COSTUME_SLUG.test(c.slug)).toBe(true);
  });
  test("a prompt is the shared rule plus the costume line", () => {
    expect(buildPrompt(" a black pointy witch hat ")).toBe(`${SHARED_RULE} a black pointy witch hat.`);
    expect(SHARED_RULE).toMatch(/^Edit this image\. Keep the character exactly the same/);
  });
  test("admin costume edits are checked", () => {
    expect(checkCostumePatch({ prompt: "a tall black top hat and a monocle", enabled: false })).toEqual({
      ok: true, changed: { prompt: "a tall black top hat and a monocle", enabled: false },
    });
    expect(checkCostumePatch({ prompt: "short" })).toEqual({ ok: false, error: "The costume line must be 10 to 600 characters." });
    expect(checkCostumePatch({ label: "" })).toEqual({ ok: false, error: "The label must be 1 to 24 characters." });
    expect(checkCostumePatch({ emoji: "" })).toEqual({ ok: false, error: "The emoji must be 1 to 8 characters." });
    expect(checkCostumePatch({ enabled: "yes" })).toEqual({ ok: false, error: "enabled must be true or false." });
    expect(checkCostumePatch({ slug: "x" })).toEqual({ ok: false, error: "Unknown field: slug." });
    expect(checkCostumePatch([])).toEqual({ ok: false, error: "Send the changes as an object." });
  });
});
