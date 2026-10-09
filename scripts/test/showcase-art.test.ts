import sharp from "sharp";
import { describe, expect, test } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { encodeShowcase, generateImage, parseArgs, readSecret, SHOWCASE_SLUGS } from "../showcase-art-lib.mjs";

test("the eight showcase images", () => {
  expect(SHOWCASE_SLUGS).toEqual(["plain", "ghost", "witch", "vampire", "pumpkin", "mummy", "skeleton", "devil"]);
});

test("--only picks one known image", () => {
  expect(parseArgs([])).toEqual({ only: null });
  expect(parseArgs(["--only", "witch"])).toEqual({ only: "witch" });
  expect(() => parseArgs(["--only"])).toThrow(/needs a slug/);
  expect(() => parseArgs(["--only", "zombie"])).toThrow(/Unknown costume: zombie/);
  expect(() => parseArgs(["--all"])).toThrow(/Unknown option/);
});

test("reads one secret from a .env-style file", () => {
  const text = "# comment\r\nHELIUS_API_KEY=abc\r\nOPENROUTER_API_KEY=\"sk-or-123\"\r\n";
  expect(readSecret(text, "OPENROUTER_API_KEY")).toBe("sk-or-123");
  expect(readSecret("OPENROUTER_API_KEY=sk-or-9", "OPENROUTER_API_KEY")).toBe("sk-or-9");
  expect(readSecret(text, "MISSING")).toBe("");
});

describe("generateImage", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  test("sends the production request shape without an input image and returns the bytes", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization };
      return new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }] } }] }));
    }) as unknown as typeof fetch;
    const bytes = await generateImage({ apiKey: "k", model: "m", prompt: "a mascot", fetchFn });
    expect([...bytes]).toEqual([...png]);
    expect(sent).toEqual({
      url: "https://openrouter.ai/api/v1/chat/completions",
      auth: "Bearer k",
      body: { model: "m", modalities: ["image", "text"], image_config: { aspect_ratio: "1:1" },
        messages: [{ role: "user", content: [{ type: "text", text: "a mascot" }] }] },
    });
  });
  test("fails clearly on HTTP errors and answers without an image", async () => {
    const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    await expect(generateImage({ apiKey: "k", model: "m", prompt: "p", fetchFn: reply("no credit", 402) })).rejects.toThrow(/HTTP 402/);
    await expect(generateImage({ apiKey: "k", model: "m", prompt: "p", fetchFn: reply(JSON.stringify({ choices: [{ message: { content: "no" } }] })) }))
      .rejects.toThrow(/didn't return an image/);
  });
});

describe("encodeShowcase", () => {
  test("makes a 768 px square webp under 200 KB", async () => {
    const input = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#5a2d82" } }).png().toBuffer();
    const out = await encodeShowcase(input);
    expect(out.length).toBeLessThanOrEqual(200 * 1024);
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 768, 768]);
  });
  test("refuses when nothing fits", async () => {
    const input = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(encodeShowcase(input, { maxBytes: 10 })).rejects.toThrow(/under 10 bytes/);
  });
});
