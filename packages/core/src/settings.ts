// The single settings row (spec §6). Bounds match the check constraints in supabase/migrations/0001_spookpad.sql.
export interface Settings {
  costume_fee_lamports: number;
  launch_fee_lamports: number;
  max_dev_buy_lamports: number;
  max_generations_per_hour: number;
  min_ai_credit_usd: number;
  generations_paused: boolean;
  launches_paused: boolean;
  pause_reason: "admin" | "low_credit" | null; // why costume summoning is paused
}

export const DEFAULT_SETTINGS: Settings = {
  costume_fee_lamports: 1_000_000,
  launch_fee_lamports: 20_000_000,
  max_dev_buy_lamports: 5_000_000_000,
  max_generations_per_hour: 20,
  min_ai_credit_usd: 2,
  generations_paused: false,
  launches_paused: false,
  pause_reason: null,
};

type IntKey = "costume_fee_lamports" | "launch_fee_lamports" | "max_dev_buy_lamports" | "max_generations_per_hour";
const INT_BOUNDS: Record<IntKey, [number, number]> = {
  costume_fee_lamports: [0, 1_000_000_000],
  launch_fee_lamports: [0, 1_000_000_000],
  max_dev_buy_lamports: [0, 100_000_000_000],
  max_generations_per_hour: [1, 500],
};

export function rowToSettings(row: Record<string, unknown>): Settings {
  const reason = row.pause_reason;
  return {
    costume_fee_lamports: Number(row.costume_fee_lamports),
    launch_fee_lamports: Number(row.launch_fee_lamports),
    max_dev_buy_lamports: Number(row.max_dev_buy_lamports),
    max_generations_per_hour: Number(row.max_generations_per_hour),
    min_ai_credit_usd: Number(row.min_ai_credit_usd),
    generations_paused: row.generations_paused === true,
    launches_paused: row.launches_paused === true,
    pause_reason: reason === "admin" || reason === "low_credit" ? reason : null,
  };
}

export function validateSettingsPatch(current: Settings, patch: unknown):
  { ok: true; changed: Partial<Settings> } | { ok: false; errors: string[] } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return { ok: false, errors: ["Send the settings as an object."] };
  const changed: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k in INT_BOUNDS) {
      const [lo, hi] = INT_BOUNDS[k as IntKey];
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < lo || v > hi) errors.push(`${k} must be a whole number from ${lo} to ${hi}.`);
      else if (v !== current[k as IntKey]) changed[k] = v;
    } else if (k === "min_ai_credit_usd") {
      if (typeof v !== "number" || !(v >= 0 && v <= 1000) || Math.round(v * 100) !== v * 100) errors.push(`${k} must be a dollar amount from 0 to 1000.`);
      else if (v !== current.min_ai_credit_usd) changed[k] = v;
    } else if (k === "generations_paused" || k === "launches_paused") {
      if (typeof v !== "boolean") errors.push(`${k} must be true or false.`);
      else if (v !== current[k]) changed[k] = v;
    } else {
      errors.push(`Unknown setting: ${k}.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  if (changed.generations_paused === true) changed.pause_reason = "admin";
  if (changed.generations_paused === false) changed.pause_reason = null;
  return { ok: true, changed: changed as Partial<Settings> };
}
