import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

let db: TestDb;
const ADMIN = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const CA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.stop(); });

const publicCa = async () => (await db.as("anon", null, (tx) => tx`select site_ca from v_settings_public`))[0].site_ca;

test("the hero's CA starts empty and browsers can read it", async () => {
  expect(await publicCa()).toBeNull();
});

test("the admin sets and clears it through admin_update_settings, and it is logged", async () => {
  await db.sql`select admin_update_settings(${db.sql.json({ site_ca: CA })}, ${ADMIN})`;
  expect(await publicCa()).toBe(CA);
  await db.sql`select admin_update_settings(${db.sql.json({ site_ca: null })}, ${ADMIN})`;
  expect(await publicCa()).toBeNull();
  const log = await db.sql`select payload from admin_log where action = 'settings.update' order by id`;
  expect(log.map((r) => r.payload)).toEqual([{ site_ca: CA }, { site_ca: null }]);
});

test("the table refuses anything that isn't a Solana address", async () => {
  await expect(db.sql`update settings set site_ca = 'https://pump.fun' where id`).rejects.toThrow(/check/);
});

test("browsers still can't call the admin function", async () => {
  await expect(db.as("anon", null, (tx) => tx`select admin_update_settings('{"site_ca": null}'::jsonb, 'x')`)).rejects.toThrow(/permission denied/);
});
