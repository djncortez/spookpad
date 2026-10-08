import { describe, expect, test } from "vitest";
import { fromBase64 } from "@spookpad/core/encoding";
import type { Art } from "@spookpad/core/image-type";
import { ASSOCIATED_TOKEN_PROGRAM } from "@spookpad/core/pump-buy";
import { BUY_EXACT_SOL_IN, PUMP_PROGRAM } from "@spookpad/core/pump-tx";
import { DEFAULT_SETTINGS, type Settings } from "@spookpad/core/settings";
import { decodeTransaction, SYSTEM_PROGRAM } from "@spookpad/core/solana-tx";
import { StoreError } from "../src/errors";
import { createPrepareLaunchHandler, type PrepareLaunchDeps } from "../src/prepare-launch";
import type { CoinMetadata } from "../src/pump-services";
import type { GenerationRow, NewLaunch } from "../src/store";
import { fakeCreateTx } from "./fixtures/pump";

const ORIGIN = "http://localhost:3000";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const TREASURY = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const GEN = "00000000-0000-4000-8000-000000000001";
const COSTUME: Art = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]), type: "image/jpeg" };
const fields = { name: "Spooky Frog", ticker: "sfrog", description: "Boo.", twitter: "", telegram: "" };

function setup(o: { settings?: Partial<Settings>; gen?: Partial<GenerationRow>; createTx?: PrepareLaunchDeps["createTx"]; lookupTables?: PrepareLaunchDeps["lookupTables"]; begin?: () => never } = {}) {
  const log = { ipfs: [] as { meta: CoinMetadata; art: Art }[], saved: [] as string[][], launches: [] as NewLaunch[], downloads: [] as string[] };
  const gen: GenerationRow = {
    id: GEN, wallet: WALLET, draft_id: GEN, costume: "ghost", original_path: `originals/${GEN}.png`, result_path: `costumes/${GEN}.jpg`,
    state: "ready", fee_lamports: 1_000_000, attempts: 1, error: null, metadata_key: null, metadata_uri: null, refunded_at: null,
    created_at: "2026-10-08T00:00:00Z", ...o.gen,
  };
  const deps: PrepareLaunchDeps = {
    origins: [ORIGIN], treasury: TREASURY, siteUrl: "https://spookpad.fun",
    walletFromToken: async (t) => (t === "good" ? WALLET : null),
    loadSettings: async () => ({ ...DEFAULT_SETTINGS, ...o.settings }),
    loadGeneration: async (id) => (id === GEN ? gen : null),
    downloadArt: async (p) => { log.downloads.push(p); return COSTUME; },
    ipfs: async (meta, art) => { log.ipfs.push({ meta, art }); return "https://ipfs.io/ipfs/meta"; },
    saveMetadata: async (id, key, uri) => { log.saved.push([id, key, uri]); },
    createTx: o.createTx ?? (async (p) => fakeCreateTx(p)),
    lookupTables: o.lookupTables ?? (async () => ({})),
    beginLaunch: async (l) => {
      if (o.begin) o.begin();
      log.launches.push(l);
      return { mint: l.mint, wallet: l.wallet, generation_id: l.generationId, name: l.name, ticker: l.ticker, description: l.description,
        twitter: l.twitter, telegram: l.telegram, dev_buy_lamports: l.devBuyLamports, metadata_uri: l.metadataUri,
        launch_fee_lamports: l.launchFeeLamports, create_signature: null, state: "pending", launched_at: null };
    },
  };
  const handler = createPrepareLaunchHandler(deps);
  const call = async (body: Record<string, unknown>, token = "good") => {
    const res = await handler(new Request("https://x/functions/v1/prepare-launch", {
      method: "POST", headers: { origin: ORIGIN, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { call, log };
}
const launch = (extra: Record<string, unknown> = {}) => ({ generation_id: GEN, mint: MINT, dev_buy_lamports: 0, ...fields, ...extra });

describe("prepare-launch", () => {
  test("uploads the costume (never the original), builds the create tx and adds the launch fee", async () => {
    const { call, log } = setup();
    const r = await call(launch());
    expect(r.status).toBe(200);
    expect(r.body.launch_fee_lamports).toBe(20_000_000);
    expect(log.downloads).toEqual([`costumes/${GEN}.jpg`]);
    expect(log.ipfs).toEqual([{ meta: { name: "Spooky Frog", symbol: "SFROG", description: "Boo.", twitter: null, telegram: null, website: "https://spookpad.fun" }, art: COSTUME }]);
    expect(log.saved).toEqual([[GEN, JSON.stringify(["Spooky Frog", "SFROG", "Boo.", null, null]), "https://ipfs.io/ipfs/meta"]]);
    const tx = decodeTransaction(fromBase64(r.body.transaction));
    const last = tx.instructions[tx.instructions.length - 1];
    expect(tx.staticKeys[last.programIndex]).toBe(SYSTEM_PROGRAM);
    expect(tx.staticKeys[last.accounts[1]]).toBe(TREASURY);
    expect(new DataView(last.data.buffer, last.data.byteOffset).getBigUint64(4, true)).toBe(20_000_000n);
    expect(log.launches).toEqual([{ mint: MINT, wallet: WALLET, generationId: GEN, name: "Spooky Frog", ticker: "SFROG", description: "Boo.",
      twitter: null, telegram: null, devBuyLamports: 0, metadataUri: "https://ipfs.io/ipfs/meta", launchFeeLamports: 20_000_000 }]);
  });

  test("reuses the uploaded metadata when the fields didn't change", async () => {
    const key = JSON.stringify(["Spooky Frog", "SFROG", "Boo.", null, null]);
    const { call, log } = setup({ gen: { metadata_key: key, metadata_uri: "https://ipfs.io/ipfs/old" } });
    expect((await call(launch())).status).toBe(200);
    expect(log.ipfs).toEqual([]);
    expect(log.launches[0].metadataUri).toBe("https://ipfs.io/ipfs/old");
  });

  test("SpookPad adds its own dev buy (PumpPortal only creates), then the fee; too big a buy is refused", async () => {
    const asked: unknown[] = [];
    const { call } = setup({ createTx: async (p) => { asked.push(p); return fakeCreateTx(p); } });
    const r = await call(launch({ dev_buy_lamports: 500_000_000 }));
    expect(r.status).toBe(200);
    expect(asked).toEqual([{ creator: WALLET, mint: MINT, name: "Spooky Frog", symbol: "SFROG", uri: "https://ipfs.io/ipfs/meta" }]);
    const tx = decodeTransaction(fromBase64(r.body.transaction));
    expect(tx.instructions.map((ix) => tx.staticKeys[ix.programIndex])).toEqual([PUMP_PROGRAM, ASSOCIATED_TOKEN_PROGRAM, PUMP_PROGRAM, SYSTEM_PROGRAM]);
    const buy = tx.instructions[2];
    expect(Array.from(buy.data.slice(0, 8))).toEqual(BUY_EXACT_SOL_IN);
    expect(new DataView(buy.data.buffer, buy.data.byteOffset).getBigUint64(8, true)).toBe(500_000_000n); // exactly what was asked
    expect(new Set(tx.staticKeys).size).toBe(tx.staticKeys.length);
    expect(await call(launch({ dev_buy_lamports: 6_000_000_000 }))).toEqual({ status: 400, body: { error: "The dev buy can be at most 5 SOL." } });
  });

  test("reads the lookup tables PumpPortal's transaction uses; when that fails nothing is prepared", async () => {
    const asked: string[][] = [];
    expect((await setup({ lookupTables: async (t) => { asked.push(t); return {}; } }).call(launch())).status).toBe(200);
    expect(asked).toEqual([[]]); // the fake create uses none
    const { call, log } = setup({ lookupTables: async () => { throw new Error("RPC down"); } });
    expect(await call(launch())).toEqual({ status: 502, body: { error: "Couldn't build the launch transaction right now. Try again in a minute." } });
    expect(log.launches).toEqual([]);
  });

  test("with a 0 launch fee the transaction is passed on unchanged", async () => {
    const { call } = setup({ settings: { launch_fee_lamports: 0 } });
    const r = await call(launch());
    expect(decodeTransaction(fromBase64(r.body.transaction)).instructions).toHaveLength(1);
  });

  test("refuses bad fields, a bad mint, unknown or unready costumes, and a paused launchpad", async () => {
    expect((await setup().call(launch({ ticker: "!" }))).body).toEqual({ error: "Ticker must be 2 to 10 letters or digits." });
    expect((await setup().call(launch({ mint: WALLET }))).status).toBe(400);
    expect((await setup().call(launch({ generation_id: "00000000-0000-4000-8000-000000000009" }))).status).toBe(404);
    expect(await setup({ gen: { state: "paid" } }).call(launch())).toEqual({ status: 409, body: { error: "Summon a costume before launching." } });
    expect(await setup({ settings: { launches_paused: true } }).call(launch())).toEqual({ status: 409, body: { error: "Launching is paused right now. Try again soon." } });
    expect((await setup().call(launch(), "bad")).status).toBe(401);
  });

  test("a PumpPortal transaction that fails the safety check is refused", async () => {
    const { call, log } = setup({ createTx: async (p) => fakeCreateTx({ ...p, uri: "https://ipfs.io/ipfs/original" }) });
    const r = await call(launch());
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/won't sign: The coin's metadata isn't SpookPad's\./);
    expect(log.launches).toEqual([]);
  });

  test("store refusals are explained", async () => {
    expect(await setup({ begin: () => { throw new StoreError("already_launched"); } }).call(launch())).toEqual({
      status: 409, body: { error: "This costume already launched a coin. Summon a new one for another coin." },
    });
  });

  test("dev buy must be a non-negative whole number of lamports", async () => {
    for (const bad of [-1, 1.5, "5"]) {
      const { call, log } = setup();
      const r = await call(launch({ dev_buy_lamports: bad }));
      expect(r.status, String(bad)).toBe(400);
      expect(log.launches).toEqual([]);
    }
    expect((await setup({ settings: { max_dev_buy_lamports: 100 } }).call(launch({ dev_buy_lamports: 101 }))).status).toBe(400);
  });
});
