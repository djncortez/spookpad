import { expect, test } from "vitest";
import { heliusUrl, jsonRpc } from "../src/rpc";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

test("returns the result and sends a JSON-RPC 2.0 request", async () => {
  const sent: unknown[] = [];
  const rpc = jsonRpc("https://rpc", async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return reply(200, { result: 42 }); });
  expect(await rpc("getBalance", ["W"])).toBe(42);
  expect(sent).toEqual([{ jsonrpc: "2.0", id: 1, method: "getBalance", params: ["W"] }]);
});

test("retries on 429 and then succeeds", async () => {
  let n = 0;
  const rpc = jsonRpc("https://rpc", async () => (++n < 3 ? reply(429, {}) : reply(200, { result: "ok" })), async () => {});
  expect(await rpc("getSlot", [])).toBe("ok");
  expect(n).toBe(3);
});

test("throws the RPC error message", async () => {
  const rpc = jsonRpc("https://rpc", async () => reply(200, { error: { code: -32602, message: "Invalid param" } }));
  await expect(rpc("getBalance", ["bad"])).rejects.toThrow("getBalance: Invalid param");
});

test("throws on HTTP errors after retries run out", async () => {
  const rpc = jsonRpc("https://rpc", async () => reply(429, {}), async () => {});
  await expect(rpc("getSlot", [])).rejects.toThrow("getSlot: HTTP 429");
});

test("heliusUrl builds the mainnet URL", () => {
  expect(heliusUrl("KEY")).toBe("https://mainnet.helius-rpc.com/?api-key=KEY");
});
