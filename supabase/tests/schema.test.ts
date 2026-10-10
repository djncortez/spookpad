import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SEED_COSTUMES } from "@spookpad/core/costumes";
import { DEFAULT_SETTINGS, rowToSettings } from "@spookpad/core/settings";
import { startTestDb, type TestDb } from "./helpers/db";

let db: TestDb;
beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.stop(); });

const W1 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const W2 = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const signUp = async (meta: object, appMeta: object): Promise<string> =>
  (await db.sql`insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
    (${db.sql.json(meta as never)}, ${db.sql.json(appMeta as never)}) returning id`)[0].id;

describe("wallet sign-up", () => {
  test("a Solana web3 sign-in creates the SpookPad user", async () => {
    const id = await signUp({ sub: `web3:solana:${W1}` }, { provider: "web3" });
    expect(await db.sql`select wallet from users where id = ${id}`).toEqual([{ wallet: W1 }]);
  });
  test("an email sign-up with wallet-shaped metadata creates nothing", async () => {
    const id = await signUp({ sub: `web3:solana:${W2}` }, { provider: "email" });
    expect(await db.sql`select 1 from users where id = ${id}`).toHaveLength(0);
  });
});

describe("seed data", () => {
  test("settings start at the spec's defaults", async () => {
    expect(rowToSettings((await db.sql`select * from settings`)[0])).toEqual(DEFAULT_SETTINGS);
  });
  test("costumes match SEED_COSTUMES", async () => {
    const rows = await db.sql`select slug, label, emoji, prompt, sort from costumes where enabled order by sort`;
    expect(rows.map((r) => ({ ...r }))).toEqual(SEED_COSTUMES);
  });
  test("the art bucket is public and only takes images", async () => {
    expect(await db.sql`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'art'`).toEqual([
      { public: true, file_size_limit: "8388608", allowed_mime_types: ["image/png", "image/jpeg", "image/webp"] },
    ]);
  });
});

describe("lock-down", () => {
  test("every public table has row level security on", async () => {
    const off = await db.sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(off).toEqual([]);
  });
  test("browsers can't read tables or call functions directly", async () => {
    const [{ id }] = await db.sql`select id from users where wallet = ${W1}`;
    const tables = (await db.sql`select tablename from pg_tables where schemaname = 'public'`).map((r) => r.tablename);
    for (const t of tables) {
      for (const [role, sub] of [["anon", null], ["authenticated", id]] as const) {
        await expect(db.as(role, sub, (tx) => tx.unsafe(`select * from public.${t} limit 1`)), `${role} reading ${t}`).rejects.toThrow(/permission denied/);
      }
    }
    const fns = await db.sql`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`;
    expect(fns.length).toBeGreaterThan(0);
    for (const { sig } of fns) {
      for (const role of ["anon", "authenticated"]) {
        const [{ ok }] = await db.sql`select has_function_privilege(${role}, ${sig}, 'execute') as ok`;
        expect(ok, `${role} executing ${sig}`).toBe(false);
      }
    }
  });
  test("browsers can read the public views", async () => {
    for (const v of ["v_settings_public", "v_costumes", "v_graveyard"]) {
      await expect(db.as("anon", null, (tx) => tx.unsafe(`select * from ${v}`))).resolves.toBeDefined();
    }
    const [settings] = await db.as("anon", null, (tx) => tx`select * from v_settings_public`);
    expect(Object.keys(settings).sort()).toEqual(
      ["costume_fee_lamports", "generations_paused", "launch_fee_lamports", "launches_paused", "max_dev_buy_lamports", "pause_reason", "site_ca"]);
    await expect(db.as("anon", null, (tx) => tx`select * from v_my_generations`)).rejects.toThrow(/permission denied/);
  });
});

describe("admin functions", () => {
  test("settings changes apply and are logged", async () => {
    const [s] = await db.sql`select * from admin_update_settings(${db.sql.json({ costume_fee_lamports: 2000000, generations_paused: true, pause_reason: "admin" })}, ${W1})`;
    expect(rowToSettings(s)).toMatchObject({ costume_fee_lamports: 2_000_000, generations_paused: true, pause_reason: "admin" });
    expect((await db.sql`select action from admin_log`).map((r) => r.action)).toContain("settings.update");
    await db.sql`select admin_update_settings(${db.sql.json({ costume_fee_lamports: 1000000, generations_paused: false, pause_reason: null })}, ${W1})`;
    expect(rowToSettings((await db.sql`select * from settings`)[0])).toEqual(DEFAULT_SETTINGS);
  });
  test("unknown settings are refused", async () => {
    await expect(db.sql`select admin_update_settings(${db.sql.json({ nope: 1 })}, ${W1})`).rejects.toThrow(/unknown setting: nope/);
  });
  test("costume edits apply; unknown costumes are refused", async () => {
    const [c] = await db.sql`select * from admin_update_costume('witch', ${db.sql.json({ prompt: "a tall black witch hat with a buckle", enabled: false })}, ${W1})`;
    expect(c).toMatchObject({ slug: "witch", prompt: "a tall black witch hat with a buckle", enabled: false });
    expect((await db.sql`select slug from v_costumes`).map((r) => r.slug)).not.toContain("witch");
    await db.sql`select admin_update_costume('witch', ${db.sql.json({ prompt: SEED_COSTUMES[1].prompt, enabled: true })}, ${W1})`;
    await expect(db.sql`select admin_update_costume('zombie', ${db.sql.json({ enabled: true })}, ${W1})`).rejects.toThrow(/not_found/);
  });
  test("low credit pauses costume summoning once", async () => {
    expect((await db.sql`select pause_for_low_credit() as p`)[0].p).toBe(true);
    expect((await db.sql`select pause_for_low_credit() as p`)[0].p).toBe(false);
    expect((await db.sql`select generations_paused, pause_reason from settings`)[0]).toEqual({ generations_paused: true, pause_reason: "low_credit" });
    await db.sql`update settings set generations_paused = false, pause_reason = null where id`;
  });
  test("the overview counts everything", async () => {
    const [{ admin_overview: o }] = await db.sql`select admin_overview()`;
    expect(Object.keys(o).sort()).toEqual(["costume_fees_lamports", "failed_unrefunded", "generations_24h", "launch_fees_lamports", "launches_24h", "live_launches", "ready_24h"]);
  });
});
