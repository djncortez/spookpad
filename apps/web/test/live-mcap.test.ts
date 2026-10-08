import { describe, expect, test, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { toBase64 } from "@spookpad/core/encoding";
import {
  b58, curveMarketCap, PUMP_PROGRAM, PUMPSWAP_PROGRAM, readCurve, readPool, tradePrice, vaultAmount, watchMarketCap, WSOL,
} from "../lib/live-mcap";

const u64 = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return [...b]; };
const curveBytes = (vTok: bigint, vQuote: bigint, supply: bigint, complete = false) =>
  new Uint8Array([...new Array(8).fill(1), ...u64(vTok), ...u64(vQuote), ...u64(0n), ...u64(0n), ...u64(supply), complete ? 1 : 0]);
const curveAccount = (bytes: Uint8Array, owner = PUMP_PROGRAM) => ({ owner, data: [toBase64(bytes), "base64"] });

describe("readers", () => {
  test("the bonding curve layout and the $NOOB market cap formula", () => {
    const c = readCurve(curveAccount(curveBytes(1_000_000_000_000_000n, 30_000_000_000n, 1_000_000_000_000_000n)));
    expect(c).toEqual({ vTok: 1e15, vQuote: 3e10, supply: 1e15, complete: false });
    expect(curveMarketCap(c!, 9, 200)).toBeCloseTo(6000, 6); // 30 SOL of virtual reserves at $200
    expect(readCurve(curveAccount(curveBytes(1n, 1n, 1n, true)))!.complete).toBe(true);
    expect(readCurve(curveAccount(curveBytes(1n, 1n, 1n), "Other111111111111111111111111111111111111111"))).toBeNull();
    expect(readCurve(null)).toBeNull();
  });
  test("the PumpSwap pool layout, only for this token", () => {
    const keys = Array.from({ length: 6 }, () => Keypair.generate().publicKey);
    const bytes = new Uint8Array([...new Array(8).fill(0), 1, 0, 0, ...keys.flatMap((k) => [...k.toBytes()])]);
    const ca = keys[1].toBase58();
    expect(readPool({ owner: PUMPSWAP_PROGRAM, data: [toBase64(bytes), "base64"] }, ca)).toEqual({
      quoteMint: keys[2].toBase58(), baseVault: keys[4].toBase58(), quoteVault: keys[5].toBase58(),
    });
    expect(readPool({ owner: PUMPSWAP_PROGRAM, data: [toBase64(bytes), "base64"] }, keys[0].toBase58())).toBeNull();
  });
  test("trade price is quote moved over tokens moved, in opposite directions only", () => {
    expect(tradePrice(-1000, 0.5)).toBe(0.0005);
    expect(tradePrice(1000, 0.5)).toBeNull();
    expect(tradePrice(0, 0.5)).toBeNull();
  });
  test("vault amounts and base58", () => {
    expect(vaultAmount({ data: { parsed: { info: { tokenAmount: { uiAmountString: "12.5" } } } } })).toBe(12.5);
    expect(vaultAmount(null)).toBeNull();
    const k = Keypair.generate().publicKey;
    expect(b58(k.toBytes())).toBe(k.toBase58());
  });
});

class FakeSocket {
  static last: FakeSocket;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.last = this; setTimeout(() => this.onopen?.(), 0); }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = 3; }
}

describe("watchMarketCap", () => {
  const CA = Keypair.generate().publicKey.toBase58();
  const CURVE = Keypair.generate().publicKey.toBase58();
  const dex = { pairs: [{ dexId: "pumpfun", pairAddress: CURVE, quoteToken: { address: WSOL }, marketCap: 5000, priceUsd: "0.000005", priceNative: "0.000000025", liquidity: { usd: 1 } }] };
  const fakeFetch = (curve: Uint8Array) => (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://api.dexscreener.com/")) return new Response(JSON.stringify(dex));
    if (u.startsWith("https://lite-api.jup.ag/")) return new Response(JSON.stringify({ [WSOL]: { usdPrice: 200, decimals: 9 } }));
    const body = JSON.parse(String(init?.body));
    if (body.method === "getAccountInfo") return new Response(JSON.stringify({ result: { value: curveAccount(curve) } }));
    throw new Error(`unexpected ${u}`);
  }) as typeof fetch;

  test("shows the DEX Screener snapshot, then the on-chain curve, and moves on every curve update", async () => {
    const updates: [number, string][] = [];
    const stop = watchMarketCap({
      ca: CA, rpcUrl: "https://rpc.example/?api-key=k", onUpdate: (mc, src) => updates.push([Math.round(mc), src]),
      fetchFn: fakeFetch(curveBytes(1_000_000_000_000_000n, 30_000_000_000n, 1_000_000_000_000_000n)),
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });
    await vi.waitFor(() => expect(updates).toContainEqual([6000, "chain"]));
    expect(updates[0]).toEqual([5000, "dexscreener"]);
    expect(FakeSocket.last.url).toBe("wss://rpc.example/?api-key=k");
    expect(JSON.parse(FakeSocket.last.sent[0])).toMatchObject({ method: "accountSubscribe", params: [CURVE, { encoding: "base64" }] });
    // a trade: the subscription confirms, then pushes the new curve state (60 SOL of virtual reserves)
    FakeSocket.last.onmessage!({ data: JSON.stringify({ id: 1, result: 77 }) });
    FakeSocket.last.onmessage!({ data: JSON.stringify({ params: { subscription: 77, result: { value: curveAccount(curveBytes(1_000_000_000_000_000n, 60_000_000_000n, 1_000_000_000_000_000n)) } } }) });
    expect(updates[updates.length - 1]).toEqual([12000, "chain"]);
    stop();
  });

  test("without an RPC URL it polls DEX Screener", async () => {
    const updates: [number, string][] = [];
    const stop = watchMarketCap({ ca: CA, rpcUrl: "", onUpdate: (mc, src) => updates.push([mc, src]), fetchFn: fakeFetch(new Uint8Array()) });
    await vi.waitFor(() => expect(updates.length).toBeGreaterThanOrEqual(2));
    expect(updates.every(([mc, src]) => mc === 5000 && src === "dexscreener")).toBe(true);
    stop();
  });
});
