import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, rowToSettings, validateSettingsPatch } from "../src/settings";

describe("settings", () => {
  test("defaults match the spec", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      costume_fee_lamports: 1_000_000, launch_fee_lamports: 20_000_000, max_dev_buy_lamports: 5_000_000_000,
      max_generations_per_hour: 20, min_ai_credit_usd: 2, generations_paused: false, launches_paused: false, pause_reason: null,
    });
  });
  test("a database row (bigints and numeric as strings) becomes Settings", () => {
    expect(rowToSettings({
      id: true, costume_fee_lamports: "1000000", launch_fee_lamports: "20000000", max_dev_buy_lamports: "5000000000",
      max_generations_per_hour: 20, min_ai_credit_usd: "2.00", generations_paused: false, launches_paused: false, pause_reason: null,
      updated_at: "2026-10-08T00:00:00Z",
    })).toEqual(DEFAULT_SETTINGS);
  });
  test("a patch keeps only real changes", () => {
    expect(validateSettingsPatch(DEFAULT_SETTINGS, { costume_fee_lamports: 2_000_000, launch_fee_lamports: 20_000_000 })).toEqual({
      ok: true, changed: { costume_fee_lamports: 2_000_000 },
    });
  });
  test("pausing by hand records why; unpausing clears it", () => {
    expect(validateSettingsPatch(DEFAULT_SETTINGS, { generations_paused: true })).toEqual({
      ok: true, changed: { generations_paused: true, pause_reason: "admin" },
    });
    const lowCredit = { ...DEFAULT_SETTINGS, generations_paused: true, pause_reason: "low_credit" as const };
    expect(validateSettingsPatch(lowCredit, { generations_paused: false })).toEqual({
      ok: true, changed: { generations_paused: false, pause_reason: null },
    });
  });
  test("bad values and unknown keys are refused", () => {
    expect(validateSettingsPatch(DEFAULT_SETTINGS, { costume_fee_lamports: -1, foo: 1, min_ai_credit_usd: 1.234, launches_paused: "no" })).toEqual({
      ok: false,
      errors: [
        "costume_fee_lamports must be a whole number from 0 to 1000000000.",
        "Unknown setting: foo.",
        "min_ai_credit_usd must be a dollar amount from 0 to 1000.",
        "launches_paused must be true or false.",
      ],
    });
    expect(validateSettingsPatch(DEFAULT_SETTINGS, { pause_reason: "admin" })).toEqual({ ok: false, errors: ["Unknown setting: pause_reason."] });
  });
});
