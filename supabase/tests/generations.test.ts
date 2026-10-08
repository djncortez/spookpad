import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

let db: TestDb;
const W1 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const W2 = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
let user1 = "";
beforeAll(async () => {
  db = await startTestDb();
  for (const w of [W1, W2]) {
    const [{ id }] = await db.sql`insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
      (${db.sql.json({ sub: `web3:solana:${w}` })}, ${db.sql.json({ provider: "web3" })}) returning id`;
    if (w === W1) user1 = id;
  }
});
afterAll(async () => { await db?.stop(); });

const sig = (n: number) => "4".repeat(80) + "abcdefgh".slice(0, 8 - String(n).length) + String(n);
const msg = (p: Promise<unknown>) => p.then(() => "ok", (e: Error) => e.message);
const start = async (wallet = W1, costume = "ghost") => {
  const id = crypto.randomUUID();
  const [g] = await db.sql`select * from start_generation(${id}::uuid, ${wallet}, ${crypto.randomUUID()}::uuid, ${costume}, ${`originals/${id}.png`})`;
  return g;
};

describe("generation lifecycle", () => {
  test("start -> pay -> attempt -> ready", async () => {
    const g = await start();
    expect(g).toMatchObject({ state: "awaiting_payment", fee_lamports: "1000000", attempts: 0 });
    const [paid] = await db.sql`select * from claim_payment(${sig(1)}, ${g.id}::uuid, ${W1}, 1000000)`;
    expect(paid.state).toBe("paid");
    const [going] = await db.sql`select * from begin_attempt(${g.id}::uuid, ${W1})`;
    expect(going).toMatchObject({ state: "generating", attempts: 1 });
    const [done] = await db.sql`select * from finish_attempt(${g.id}::uuid, ${`costumes/${g.id}.png`}, null)`;
    expect(done).toMatchObject({ state: "ready", result_path: `costumes/${g.id}.png`, error: null });
  });

  test("a payment can't be claimed twice or for someone else's costume", async () => {
    const a = await start();
    const b = await start();
    await db.sql`select claim_payment(${sig(2)}, ${a.id}::uuid, ${W1}, 1000000)`;
    expect(await msg(db.sql`select claim_payment(${sig(2)}, ${b.id}::uuid, ${W1}, 1000000)`)).toBe("payment_used");
    expect(await msg(db.sql`select claim_payment(${sig(3)}, ${a.id}::uuid, ${W1}, 1000000)`)).toBe("not_awaiting");
    expect(await msg(db.sql`select claim_payment(${sig(4)}, ${b.id}::uuid, ${W2}, 1000000)`)).toBe("not_found");
  });

  test("failed attempts are retried for free, at most 3 times", async () => {
    const g = await start();
    expect(await msg(db.sql`select begin_attempt(${g.id}::uuid, ${W1})`)).toBe("not_paid");
    await db.sql`select claim_payment(${sig(5)}, ${g.id}::uuid, ${W1}, 1000000)`;
    for (let i = 1; i <= 3; i++) {
      await db.sql`select begin_attempt(${g.id}::uuid, ${W1})`;
      const [r] = await db.sql`select * from finish_attempt(${g.id}::uuid, null, 'The AI refused.')`;
      expect(r.state).toBe(i < 3 ? "paid" : "failed");
    }
    expect(await msg(db.sql`select begin_attempt(${g.id}::uuid, ${W1})`)).toBe("not_paid");
  });

  test("a stuck attempt can be taken over after 3 minutes", async () => {
    const g = await start();
    await db.sql`select claim_payment(${sig(6)}, ${g.id}::uuid, ${W1}, 1000000)`;
    await db.sql`select begin_attempt(${g.id}::uuid, ${W1})`;
    expect(await msg(db.sql`select begin_attempt(${g.id}::uuid, ${W1})`)).toBe("not_paid");
    await db.sql`update generations set updated_at = now() - interval '4 minutes' where id = ${g.id}`;
    const [again] = await db.sql`select * from begin_attempt(${g.id}::uuid, ${W1})`;
    expect(again.attempts).toBe(2);
  });

  test("a stale third attempt is marked failed and surfaces as refundable", async () => {
    const g = await start();
    await db.sql`select claim_payment(${sig(7)}, ${g.id}::uuid, ${W1}, 1000000)`;
    await db.sql`select begin_attempt(${g.id}::uuid, ${W1})`;
    await db.sql`update generations set attempts = 3, updated_at = now() - interval '4 minutes' where id = ${g.id}`;
    const before = (await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded;
    const [r] = await db.sql`select * from begin_attempt(${g.id}::uuid, ${W1})`;
    expect(r).toMatchObject({ state: "failed", attempts: 3 });
    expect((await db.sql`select state from generations where id = ${g.id}`)[0].state).toBe("failed");
    expect((await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded).toBe(before + 1);
    await db.sql`select admin_mark_refunded(${g.id}::uuid, ${W1})`;
  });

  test("paused, unknown costume, rate limit", async () => {
    await db.sql`update settings set generations_paused = true where id`;
    expect(await msg(start())).toBe("paused");
    await db.sql`update settings set generations_paused = false, max_generations_per_hour = 1 where id`;
    expect(await msg(start(W2, "zombie"))).toBe("bad_costume");
    await start(W2);
    expect(await msg(start(W2))).toBe("rate_limited");
    await db.sql`update settings set max_generations_per_hour = 20 where id`;
  });

  test("the hourly cap counts earlier starts for the wallet", async () => {
    await db.sql`update settings set max_generations_per_hour = 2 where id`;
    const W3 = "5ZiE3vAkrdXBgyFL7KqG3RoEGBws4CjRcXVbABDLZTgx";
    await db.sql`insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
      (${db.sql.json({ sub: `web3:solana:${W3}` })}, ${db.sql.json({ provider: "web3" })})`;
    await start(W3);
    await start(W3);
    expect(await msg(start(W3))).toBe("rate_limited");
    await db.sql`update settings set max_generations_per_hour = 20 where id`;
  });

  test("a free costume (fee 0) starts paid", async () => {
    await db.sql`update settings set costume_fee_lamports = 0 where id`;
    expect((await start()).state).toBe("paid");
    await db.sql`update settings set costume_fee_lamports = 1000000 where id`;
  });

  test("a trader sees only their own generations", async () => {
    const mine = await db.as("authenticated", user1, (tx) => tx`select distinct id from v_my_generations`);
    const all = await db.sql`select id from generations where wallet = ${W1}`;
    expect(mine.length).toBe(all.length);
    expect(mine.length).toBeGreaterThan(0);
  });
});
