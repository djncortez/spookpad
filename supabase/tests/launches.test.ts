import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

let db: TestDb;
const W1 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const W2 = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT_A = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT_B = "So11111111111111111111111111111111111111112";
const MINT_C = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SIG_A = "5".repeat(88);
const SIG_C = "6".repeat(88);
const msg = (p: Promise<unknown>) => p.then(() => "ok", (e: Error) => e.message);
let ready = "";
let notReady = "";

beforeAll(async () => {
  db = await startTestDb();
  for (const w of [W1, W2]) {
    await db.sql`insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
      (${db.sql.json({ sub: `web3:solana:${w}` })}, ${db.sql.json({ provider: "web3" })})`;
  }
  ready = crypto.randomUUID();
  notReady = crypto.randomUUID();
  for (const id of [ready, notReady]) {
    await db.sql`select start_generation(${id}::uuid, ${W1}, ${crypto.randomUUID()}::uuid, 'ghost', ${`originals/${id}.png`})`;
  }
  await db.sql`update generations set state = 'ready', result_path = ${`costumes/${ready}.png`} where id = ${ready}`;
});
afterAll(async () => { await db?.stop(); });

const begin = (mint: string, generation = ready, wallet = W1) =>
  db.sql`select * from begin_launch(${mint}, ${wallet}, ${generation}::uuid, 'Spooky Frog', 'SFROG', 'Boo.', null, null, 0, 'https://ipfs.io/ipfs/meta', 20000000)`;

describe("launches", () => {
  test("only a ready costume of your own can be launched", async () => {
    expect(await msg(begin(MINT_A, notReady))).toBe("not_ready");
    expect(await msg(begin(MINT_A, ready, W2))).toBe("not_found");
  });

  test("preparing again abandons the earlier pending launch", async () => {
    await begin(MINT_A);
    await begin(MINT_B);
    expect(await db.sql`select mint, state from launches order by created_at, mint`).toEqual([
      { mint: MINT_A, state: "abandoned" }, { mint: MINT_B, state: "pending" },
    ]);
    expect(await msg(begin(MINT_B))).toBe("mint_used");
  });

  test("confirming makes it live and lists it in the graveyard", async () => {
    const [l] = await db.sql`select * from confirm_launch(${MINT_A}, ${W1}, ${SIG_A})`;
    expect(l).toMatchObject({ state: "live", create_signature: SIG_A });
    expect((await db.sql`select state from launches where mint = ${MINT_B}`)[0].state).toBe("abandoned");
    const grave = await db.as("anon", null, (tx) => tx`select mint, ticker, costume, result_path from v_graveyard`);
    expect(grave).toEqual([{ mint: MINT_A, ticker: "SFROG", costume: "ghost", result_path: `costumes/${ready}.png` }]);
    expect((await db.sql`select * from confirm_launch(${MINT_A}, ${W1}, ${SIG_A})`)[0].state).toBe("live"); // idempotent
  });

  test("a costume launches once", async () => {
    expect(await msg(begin(MINT_C))).toBe("already_launched");
    expect(await msg(db.sql`select confirm_launch(${MINT_B}, ${W1}, ${SIG_C})`)).toBe("already_launched");
    expect(await msg(db.sql`select confirm_launch(${MINT_A}, ${W2}, ${SIG_A})`)).toBe("not_found");
  });

  test("launching can be paused", async () => {
    await db.sql`update settings set launches_paused = true where id`;
    expect(await msg(begin(MINT_C, notReady))).toBe("paused");
    await db.sql`update settings set launches_paused = false where id`;
  });

  test("refunds are marked once, only for failed costumes", async () => {
    expect(await msg(db.sql`select admin_mark_refunded(${ready}::uuid, ${W1})`)).toBe("not_refundable");
    await db.sql`update generations set state = 'failed' where id = ${notReady}`;
    await db.sql`select admin_mark_refunded(${notReady}::uuid, ${W1})`;
    expect(await msg(db.sql`select admin_mark_refunded(${notReady}::uuid, ${W1})`)).toBe("not_refundable");
  });
});
