import { expect, test } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { toBase64 } from "@spookpad/core/encoding";
import { curveAddress, graveyardCaps } from "../lib/graveyard-caps";
import { PUMP_PROGRAM, WSOL } from "../lib/live-mcap";

const u64 = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return [...b]; };
const curve = (vQuote: bigint, complete: boolean) => ({
  owner: PUMP_PROGRAM,
  data: [toBase64(new Uint8Array([...new Array(8).fill(1), ...u64(1_000_000_000_000_000n), ...u64(vQuote), ...u64(0n), ...u64(0n), ...u64(1_000_000_000_000_000n), complete ? 1 : 0])), "base64"],
});

test("the bonding curve is the mint's PDA under the pump.fun program", () => {
  const mint = Keypair.generate().publicKey;
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], new PublicKey(PUMP_PROGRAM));
  expect(curveAddress(mint.toBase58())).toBe(pda.toBase58());
});

test("curves are read on-chain in one call; graduated or unknown coins use DEX Screener", async () => {
  const [onCurve, graduated, unknown] = Array.from({ length: 3 }, () => Keypair.generate().publicKey.toBase58());
  const calls: string[] = [];
  const caps = await graveyardCaps([onCurve, graduated, unknown], "https://rpc.example", (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(u.split("?")[0]);
    if (u.startsWith("https://lite-api.jup.ag/")) return new Response(JSON.stringify({ [WSOL]: { usdPrice: 200, decimals: 9 } }));
    if (u.startsWith("https://api.dexscreener.com/")) {
      expect(u).toBe(`https://api.dexscreener.com/tokens/v1/solana/${graduated},${unknown}`);
      return new Response(JSON.stringify([{ baseToken: { address: graduated }, marketCap: 250_000 }]));
    }
    const body = JSON.parse(String(init?.body));
    expect(body.params[0]).toEqual([curveAddress(onCurve), curveAddress(graduated), curveAddress(unknown)]);
    return new Response(JSON.stringify({ result: { value: [curve(30_000_000_000n, false), curve(85_000_000_000n, true), null] } }));
  }) as typeof fetch);
  expect(caps[onCurve]).toBeCloseTo(6000, 6);
  expect(caps[graduated]).toBe(250_000);
  expect(caps[unknown]).toBeUndefined();
  expect(calls.filter((c) => c === "https://rpc.example")).toHaveLength(1);
});

test("without an RPC URL everything comes from DEX Screener", async () => {
  const mint = Keypair.generate().publicKey.toBase58();
  const caps = await graveyardCaps([mint], "", async () => new Response(JSON.stringify([{ baseToken: { address: mint }, marketCap: 42 }])));
  expect(caps).toEqual({ [mint]: 42 });
});

test("newestOnly applies answers in request order and drops older ones that arrive late", async () => {
  const { newestOnly } = await import("../lib/graveyard-caps");
  const applied: string[] = [];
  const deliver = newestOnly<string>((v) => applied.push(v));
  let resolveFirst!: (v: string) => void;
  const first = deliver(new Promise<string>((r) => { resolveFirst = r; }));
  await deliver(Promise.resolve("second"));
  resolveFirst("first (late)");
  await first;
  expect(applied).toEqual(["second"]);
  await deliver(Promise.resolve("third"));
  expect(applied).toEqual(["second", "third"]);
});

test("newestOnly swallows a failed read: the last good caps stay", async () => {
  const { newestOnly } = await import("../lib/graveyard-caps");
  const applied: number[] = [];
  const deliver = newestOnly<number>((v) => applied.push(v));
  await deliver(Promise.resolve(1));
  await expect(deliver(Promise.reject(new Error("rpc down")))).resolves.toBeUndefined();
  expect(applied).toEqual([1]);
});
