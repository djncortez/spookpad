import { describe, expect, test } from "vitest";
import { ipfsUploader, pumpPortalCreate, telegramPoster } from "../src/pump-services";

const meta = { name: "Spooky Frog", symbol: "SFROG", description: "Boo.", twitter: null, telegram: null, website: "https://spookpad.fun" };
const art = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), type: "image/png" as const };

describe("pumpPortalCreate", () => {
  test("asks for a create only, never a dev buy", async () => {
    let body: Record<string, unknown> = {};
    const tx = await pumpPortalCreate({ creator: "C", mint: "M", name: "Spooky Frog", symbol: "SFROG", uri: "https://u" },
      async (_u, init) => { body = JSON.parse(String(init!.body)); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); });
    expect(tx).toEqual(new Uint8Array([1, 2, 3]));
    expect(body).toEqual({
      publicKey: "C", action: "create", tokenMetadata: { name: "Spooky Frog", symbol: "SFROG", uri: "https://u" },
      mint: "M", denominatedInSol: "true", amount: 0, slippage: 10, priorityFee: 0.0005, pool: "pump",
    });
  });
  test("a non-200 answer is an error", async () => {
    await expect(pumpPortalCreate({ creator: "C", mint: "M", name: "n", symbol: "S", uri: "u" },
      async () => new Response("bad", { status: 400 }))).rejects.toThrow(/PumpPortal: HTTP 400/);
  });
});

describe("ipfsUploader", () => {
  test("uses pump.fun's IPFS endpoint", async () => {
    const upload = ipfsUploader(undefined, async () => new Response(JSON.stringify({ metadataUri: "https://ipfs.io/ipfs/meta" })));
    expect(await upload(meta, art)).toBe("https://ipfs.io/ipfs/meta");
  });
  test("falls back to Pinata when pump.fun fails and a JWT is set", async () => {
    const calls: string[] = [];
    let n = 0;
    const upload = ipfsUploader("jwt", async (url) => {
      calls.push(String(url));
      if (String(url).includes("pump.fun")) return new Response("down", { status: 503 });
      return new Response(JSON.stringify({ data: { cid: `cid${++n}` } }));
    });
    expect(await upload(meta, art)).toBe("https://ipfs.io/ipfs/cid2");
    expect(calls).toEqual(["https://pump.fun/api/ipfs", "https://uploads.pinata.cloud/v3/files", "https://uploads.pinata.cloud/v3/files"]);
  });
  test("without a JWT the pump.fun error is passed on", async () => {
    await expect(ipfsUploader(undefined, async () => new Response("down", { status: 503 }))(meta, art)).rejects.toThrow(/pump.fun IPFS: HTTP 503/);
  });
});

describe("telegramPoster", () => {
  const TOKEN = "123456:SECRET-bot-token";
  test("posts to the chat", async () => {
    let url = "";
    await telegramPoster(TOKEN, "42", async (u) => { url = String(u); return new Response("{}"); })("hi");
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
  });
  test("a network failure never leaks the bot token (URL or cause)", async () => {
    const err = await telegramPoster(TOKEN, "42", async (u) => { throw new TypeError(`fetch failed: ${String(u)}`, { cause: new Error(String(u)) }); })("hi").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Telegram: request failed");
    expect((err as Error).cause).toBeUndefined();
    expect(JSON.stringify({ m: (err as Error).message, s: (err as Error).stack })).not.toContain("SECRET");
  });
  test("an error answer says only the status", async () => {
    const err = await telegramPoster(TOKEN, "42", async (u) => new Response(`echo ${String(u)}`, { status: 401 }))("hi").catch((e: Error) => e);
    expect((err as Error).message).toBe("Telegram: HTTP 401");
  });
  test("without a token or chat nothing is sent", async () => {
    let calls = 0;
    await telegramPoster(undefined, "42", async () => { calls++; return new Response("{}"); })("hi");
    expect(calls).toBe(0);
  });
});
