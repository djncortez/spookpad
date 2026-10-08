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
    const before = (await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded;
    await db.sql`update generations set attempts = 3, updated_at = now() - interval '4 minutes' where id = ${g.id}`;
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

describe("final-review fixes", () => {
  test("v_my_generations shows updated_at (the 3-minute takeover clock)", async () => {
    const [row] = await db.as("authenticated", user1, (tx) => tx`select * from v_my_generations limit 1`);
    expect(row).toHaveProperty("updated_at");
  });

  test("no AI attempt starts while summoning is paused; the costume stays paid", async () => {
    const g = await start();
    await db.sql`select claim_payment(${sig(26)}, ${g.id}::uuid, ${W1}, 1000000)`;
    await db.sql`update settings set generations_paused = true where id`;
    expect(await msg(db.sql`select begin_attempt(${g.id}::uuid, ${W1})`)).toBe("paused");
    expect((await db.sql`select state, attempts from generations where id = ${g.id}`)[0]).toEqual({ state: "paid", attempts: 0 });
    await db.sql`update settings set generations_paused = false where id`;
    const [r] = await db.sql`select * from begin_attempt(${g.id}::uuid, ${W1})`;
    expect(r).toMatchObject({ state: "generating", attempts: 1 });
  });

  test("expire_unpaid expires unpaid costumes older than an hour, at most 50 per call, and returns their originals", async () => {
    const old = await start(W2);
    const fresh = await start(W2);
    const paid = await start(W2);
    await db.sql`select claim_payment(${sig(21)}, ${paid.id}::uuid, ${W2}, 1000000)`;
    await db.sql`update generations set created_at = now() - interval '61 minutes' where id in (${old.id}, ${paid.id})`;
    const paths = (await db.sql`select * from expire_unpaid() as p`).map((r) => r.p);
    expect(paths).toContain(old.original_path);
    expect(paths).not.toContain(fresh.original_path);
    expect(paths).not.toContain(paid.original_path);
    const states = Object.fromEntries((await db.sql`select id, state from generations where id in (${old.id}, ${fresh.id}, ${paid.id})`).map((r) => [r.id, r.state]));
    expect(states).toEqual({ [old.id]: "expired", [fresh.id]: "awaiting_payment", [paid.id]: "paid" });
    expect(await db.sql`select * from expire_unpaid()`).toEqual([]); // already expired: not returned twice
    // a payment that lands for an expired costume is refused
    expect(await msg(db.sql`select claim_payment(${sig(22)}, ${old.id}::uuid, ${W2}, 1000000)`)).toBe("not_awaiting");
  });

  test("expire_unpaid works in bounded batches of 50", async () => {
    await db.sql`insert into generations (id, wallet, draft_id, costume, original_path, fee_lamports, created_at)
      select gen_random_uuid(), ${W2}, gen_random_uuid(), 'ghost', 'originals/batch-' || i || '.png', 1000000, now() - interval '2 hours'
      from generate_series(1, 60) i`;
    expect(await db.sql`select * from expire_unpaid()`).toHaveLength(50);
    expect(await db.sql`select * from expire_unpaid()`).toHaveLength(10);
  });

  test("a stale third attempt nobody retries shows up as refundable for the admin", async () => {
    const g = await start();
    await db.sql`select claim_payment(${sig(23)}, ${g.id}::uuid, ${W1}, 1000000)`;
    await db.sql`select begin_attempt(${g.id}::uuid, ${W1})`;
    await db.sql`update generations set attempts = 3 where id = ${g.id}`;
    // still running (under 3 minutes): not failed yet
    await db.sql`select fail_stale_attempts()`;
    expect((await db.sql`select state from generations where id = ${g.id}`)[0].state).toBe("generating");
    const before = (await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded;
    await db.sql`update generations set updated_at = now() - interval '4 minutes' where id = ${g.id}`;
    expect((await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded).toBe(before + 1); // the overview sweeps first
    expect((await db.sql`select state, error from generations where id = ${g.id}`)[0]).toEqual({ state: "failed", error: "attempt_timeout" });
    await db.sql`select admin_mark_refunded(${g.id}::uuid, ${W1})`;
  });

  test("fail_stale_attempts leaves stale attempts with tries left alone (the trader can take them over)", async () => {
    const g = await start();
    await db.sql`select claim_payment(${sig(24)}, ${g.id}::uuid, ${W1}, 1000000)`;
    await db.sql`select begin_attempt(${g.id}::uuid, ${W1})`;
    await db.sql`update generations set updated_at = now() - interval '4 minutes' where id = ${g.id}`;
    expect((await db.sql`select fail_stale_attempts() as n`)[0].n).toBe(0);
    expect((await db.sql`select state from generations where id = ${g.id}`)[0].state).toBe("generating");
  });

  test("refunding a stale third attempt marks it failed first", async () => {
    const g = await start();
    await db.sql`select claim_payment(${sig(25)}, ${g.id}::uuid, ${W1}, 1000000)`;
    await db.sql`select begin_attempt(${g.id}::uuid, ${W1})`;
    await db.sql`update generations set attempts = 3, updated_at = now() - interval '4 minutes' where id = ${g.id}`;
    await db.sql`select admin_mark_refunded(${g.id}::uuid, ${W1})`;
    expect((await db.sql`select state, refunded_at is not null as refunded from generations where id = ${g.id}`)[0]).toEqual({ state: "failed", refunded: true });
  });
});

describe("round 2: a payment that lands for an expired costume", () => {
  const expired = async () => {
    const g = await start(W2);
    await db.sql`update generations set created_at = now() - interval '61 minutes' where id = ${g.id}`;
    await db.sql`select * from expire_unpaid()`;
    expect((await db.sql`select state from generations where id = ${g.id}`)[0].state).toBe("expired");
    return g;
  };

  test("claim_expired_payment records the payment and marks the costume failed for a refund", async () => {
    const g = await expired();
    const before = (await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded;
    const [r] = await db.sql`select * from claim_expired_payment(${sig(31)}, ${g.id}::uuid, ${W2}, 1000000)`;
    expect(r).toMatchObject({ state: "failed", error: "expired_paid", attempts: 0 });
    expect(await db.sql`select generation_id, lamports from costume_payments where signature = ${sig(31)}`).toEqual([{ generation_id: g.id, lamports: "1000000" }]);
    expect((await db.sql`select admin_overview() as o`)[0].o.failed_unrefunded).toBe(before + 1);
    await db.sql`select admin_mark_refunded(${g.id}::uuid, ${W1})`;
  });

  test("claim_expired_payment refuses a used signature, another wallet, and a costume that isn't expired", async () => {
    const g = await expired();
    expect(await msg(db.sql`select claim_expired_payment(${sig(31)}, ${g.id}::uuid, ${W2}, 1000000)`)).toBe("payment_used");
    expect((await db.sql`select state from generations where id = ${g.id}`)[0].state).toBe("expired");
    expect(await msg(db.sql`select claim_expired_payment(${sig(32)}, ${g.id}::uuid, ${W1}, 1000000)`)).toBe("not_found");
    const fresh = await start(W2);
    expect(await msg(db.sql`select claim_expired_payment(${sig(33)}, ${fresh.id}::uuid, ${W2}, 1000000)`)).toBe("not_awaiting");
    await db.sql`select claim_expired_payment(${sig(34)}, ${g.id}::uuid, ${W2}, 1000000)`;
    expect(await msg(db.sql`select claim_expired_payment(${sig(35)}, ${g.id}::uuid, ${W2}, 1000000)`)).toBe("not_awaiting");
  });

  test("only the service role may call claim_expired_payment", async () => {
    const fn = "public.claim_expired_payment(text, uuid, text, bigint)";
    for (const [role, ok] of [["service_role", true], ["anon", false], ["authenticated", false]] as const) {
      expect((await db.sql`select has_function_privilege(${role}, ${fn}, 'execute') as ok`)[0].ok, role).toBe(ok);
    }
  });
});
