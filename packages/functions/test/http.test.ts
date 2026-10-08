import { expect, test } from "vitest";
import { bearer, corsHeaders, json, parseOrigins } from "../src/http";

test("parseOrigins splits, trims and drops trailing slashes", () => {
  expect(parseOrigins(" https://a.app/ ,http://localhost:3000,, ")).toEqual(["https://a.app", "http://localhost:3000"]);
  expect(parseOrigins(undefined)).toEqual([]);
});

test("CORS headers are only given to allowed origins", () => {
  const req = (origin: string) => new Request("https://x/functions/v1/f", { headers: { origin } });
  expect(corsHeaders(req("https://a.app"), ["https://a.app"])["access-control-allow-origin"]).toBe("https://a.app");
  expect(corsHeaders(req("https://evil.app"), ["https://a.app"])).toEqual({});
});

test("json responses are never cached", async () => {
  const res = json({ ok: 1 }, 201, { "x-a": "b" });
  expect(res.status).toBe(201);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-a")).toBe("b");
  expect(await res.json()).toEqual({ ok: 1 });
});

test("bearer reads the token from the Authorization header", () => {
  expect(bearer(new Request("https://x", { headers: { authorization: "Bearer abc" } }))).toBe("abc");
  expect(bearer(new Request("https://x"))).toBeNull();
});
