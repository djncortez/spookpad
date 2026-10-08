import { describe, expect, test } from "vitest";
import { StoreError } from "../src/errors";
import bs58 from "bs58";
import { SYSTEM_PROGRAM_ID, type ParsedTransaction } from "@spookpad/core/fee-check";
import { CREATE_V2, PUMP_PROGRAM } from "@spookpad/core/pump-tx";
import type { Rpc } from "@spookpad/core/rpc-types";
import { createConfirmLaunchHandler } from "../src/confirm-launch";
import type { LaunchRow } from "../src/store";

const ORIGIN = "http://localhost:3000";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const TREASURY = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "62gVEr8pk9j2wvMXbTNNGYuriA1afWX3CitakYeUgfJYsC5fc89BBxsMeVLAUBEVGcPcezevVEPZ3kyB8o16Pw3z";
const URI = "https://ipfs.io/ipfs/meta";
const str = (s: string) => { const b = new TextEncoder().encode(s); const out = new Uint8Array(4 + b.length); new DataView(out.buffer).setUint32(0, b.length, true); out.set(b, 4); return [...out]; };

const pending: LaunchRow = {
  mint: MINT, wallet: WALLET, generation_id: "g", name: "Spooky Frog", ticker: "SFROG", description: "", twitter: null, telegram: null,
  dev_buy_lamports: 0, metadata_uri: URI, launch_fee_lamports: 20_000_000, create_signature: null, state: "pending", launched_at: null,
};
const launchTx = (uri = URI): ParsedTransaction => ({
  meta: { err: null },
  transaction: {
    signatures: [SIG],
    message: {
      accountKeys: [{ pubkey: WALLET, signer: true }, { pubkey: MINT, signer: true }],
      instructions: [
        { programId: PUMP_PROGRAM, accounts: [MINT], data: bs58.encode(new Uint8Array([...CREATE_V2, ...str("Spooky Frog"), ...str("SFROG"), ...str(uri), ...bs58.decode(WALLET), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) },
        { programId: SYSTEM_PROGRAM_ID, parsed: { type: "transfer", info: { source: WALLET, destination: TREASURY, lamports: 20_000_000 } } },
      ],
    },
  },
});

function setup(o: { launch?: LaunchRow | null; tx?: ParsedTransaction | null; confirmError?: Error } = {}) {
  const confirmed: string[][] = [];
  let rpcCalls = 0;
  const handler = createConfirmLaunchHandler({
    origins: [ORIGIN], treasury: TREASURY,
    walletFromToken: async (t) => (t === "good" ? WALLET : null),
    loadLaunch: async (m) => (m === MINT ? (o.launch === undefined ? pending : o.launch) : null),
    rpc: (async () => { rpcCalls++; return o.tx === undefined ? launchTx() : o.tx; }) as Rpc,
    confirmLaunch: async (mint, wallet, signature) => { if (o.confirmError) throw o.confirmError; confirmed.push([mint, wallet, signature]); return { ...pending, state: "live" }; },
  });
  const call = async (body: unknown) => {
    const res = await handler(new Request("https://x/functions/v1/confirm-launch", {
      method: "POST", headers: { origin: ORIGIN, authorization: "Bearer good", "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { call, confirmed, rpcCalls: () => rpcCalls };
}

describe("confirm-launch", () => {
  test("a confirmed launch of the prepared coin goes live", async () => {
    const { call, confirmed } = setup();
    expect(await call({ mint: MINT, signature: SIG })).toEqual({ status: 200, body: { status: "live" } });
    expect(confirmed).toEqual([[MINT, WALLET, SIG]]);
  });
  test("waits until the transaction is on Solana", async () => {
    expect(await setup({ tx: null }).call({ mint: MINT, signature: SIG })).toEqual({ status: 202, body: { status: "waiting" } });
  });
  test("a different coin is refused", async () => {
    const r = await setup({ tx: launchTx("https://ipfs.io/ipfs/original") }).call({ mint: MINT, signature: SIG });
    expect(r).toEqual({ status: 400, body: { error: "That coin isn't the one SpookPad prepared." } });
  });
  test("unknown launches are 404; a live one answers at once", async () => {
    expect((await setup({ launch: null }).call({ mint: MINT, signature: SIG })).status).toBe(404);
    const live = setup({ launch: { ...pending, state: "live" } });
    expect(await live.call({ mint: MINT, signature: SIG })).toEqual({ status: 200, body: { status: "live" } });
    expect(live.rpcCalls()).toBe(0);
    expect((await setup().call({ mint: "x", signature: SIG })).status).toBe(400);
  });
  test("a signature that already confirmed another launch is a 409", async () => {
    const r = await setup({ confirmError: new StoreError("signature_used") }).call({ mint: MINT, signature: SIG });
    expect(r).toEqual({ status: 409, body: { error: "That transaction already confirmed another launch." } });
  });
  test("checks against the stored launch, not the request body, at confirmed commitment", async () => {
    const calls: unknown[][] = [];
    const h = createConfirmLaunchHandler({
      origins: [ORIGIN], treasury: TREASURY, walletFromToken: async () => WALLET, loadLaunch: async () => pending,
      rpc: (async (...a: unknown[]) => { calls.push(a); return launchTx(); }) as Rpc,
      confirmLaunch: async () => ({ ...pending, state: "live" }),
    });
    const res = await h(new Request("https://x/f", { method: "POST", headers: { origin: ORIGIN, authorization: "Bearer good" },
      body: JSON.stringify({ mint: MINT, signature: SIG, name: "Evil", ticker: "EVIL", uri: "https://evil", launch_fee_lamports: 0 }) }));
    expect(res.status).toBe(200);
    expect(calls).toEqual([["getTransaction", [SIG, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]]]);
  });
});
