import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

let db: TestDb;
const W1 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "5".repeat(88);

beforeAll(async () => {
  db = await startTestDb();
  await db.sql`insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
    (${db.sql.json({ sub: `web3:solana:${W1}` })}, ${db.sql.json({ provider: "web3" })})`;
});
afterAll(async () => { await db?.stop(); });

const stats = async () => (await db.as("anon", null, (tx) => tx`select * from v_stats`)).map((r) => ({ ...r }));

test("browsers read the counts, which start at zero", async () => {
  expect(await stats()).toEqual([{ coins_launched: 0, costumes_summoned: 0 }]);
  await expect(db.as("authenticated", null, (tx) => tx`select * from v_stats`)).resolves.toHaveLength(1);
});

test("v_stats has the two counts and nothing else (no wallets)", async () => {
  const cols = await db.sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'v_stats'
    order by ordinal_position`;
  expect(cols.map((c) => c.column_name)).toEqual(["coins_launched", "costumes_summoned"]);
});

test("counts finished costumes and live coins only", async () => {
  const ready = crypto.randomUUID();
  const brewing = crypto.randomUUID();
  for (const id of [ready, brewing]) {
    await db.sql`select start_generation(${id}::uuid, ${W1}, ${crypto.randomUUID()}::uuid, 'ghost', ${`originals/${id}.png`})`;
  }
  await db.sql`update generations set state = 'ready', result_path = ${`costumes/${ready}.png`} where id = ${ready}`;
  expect(await stats()).toEqual([{ coins_launched: 0, costumes_summoned: 1 }]);

  await db.sql`select * from begin_launch(${MINT}, ${W1}, ${ready}::uuid, 'Spooky Frog', 'SFROG', 'Boo.', null, null, 0, 'https://ipfs.io/ipfs/meta', 20000000)`;
  expect((await stats())[0].coins_launched).toBe(0); // a pending launch isn't a coin yet
  await db.sql`select * from confirm_launch(${MINT}, ${W1}, ${SIG})`;
  expect(await stats()).toEqual([{ coins_launched: 1, costumes_summoned: 1 }]);
});

test("0001's browser views are still granted after this migration's lock-down", async () => {
  for (const v of ["v_settings_public", "v_costumes", "v_graveyard"]) {
    await expect(db.as("anon", null, (tx) => tx.unsafe(`select * from ${v}`)), v).resolves.toBeDefined();
  }
  const [{ id }] = await db.sql`select id from users where wallet = ${W1}`;
  await expect(db.as("authenticated", id, (tx) => tx`select id from v_my_generations`)).resolves.toHaveLength(2);
  await expect(db.as("anon", null, (tx) => tx`select * from v_my_generations`)).rejects.toThrow(/permission denied/);
});
