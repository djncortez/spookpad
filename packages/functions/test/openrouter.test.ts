import { describe, expect, test } from "vitest";
import { toBase64 } from "@spookpad/core/encoding";
import { AiRefused, DEFAULT_MODEL, openRouter } from "../src/openrouter";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const imageReply = (url: string) => ok({ choices: [{ message: { content: "", images: [{ type: "image_url", image_url: { url } }] } }] });

describe("openRouter.edit", () => {
  test("sends the prompt and the original as a data URL and returns the costume", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const ai = openRouter({ apiKey: "k", siteUrl: "https://spookpad.fun", fetchFn: async (url, init) => {
      sent.push({ url: String(url), init: init! });
      return imageReply(`data:image/jpeg;base64,${toBase64(JPEG)}`);
    } });
    const out = await ai.edit({ bytes: PNG, type: "image/png" }, "Add a ghost sheet.");
    expect(out).toEqual({ bytes: JPEG, type: "image/jpeg" });
    expect(sent[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = sent[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer k");
    expect(headers["http-referer"]).toBe("https://spookpad.fun");
    const body = JSON.parse(String(sent[0].init.body));
    expect(body).toMatchObject({ model: DEFAULT_MODEL, modalities: ["image", "text"], image_config: { aspect_ratio: "1:1" } });
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Add a ghost sheet." },
      { type: "image_url", image_url: { url: `data:image/png;base64,${toBase64(PNG)}` } },
    ]);
  });

  test("a text-only answer is a refusal, quoting what the model said", async () => {
    const ai = openRouter({ apiKey: "k", fetchFn: async () => ok({ choices: [{ message: { content: "I can't edit this image." } }] }) });
    const e = await ai.edit({ bytes: PNG, type: "image/png" }, "p").catch((err) => err);
    expect(e).toBeInstanceOf(AiRefused);
    expect(e.message).toBe(`The AI didn't return a costume. It said: "I can't edit this image."`);
  });

  test("HTTP errors and non-images are errors", async () => {
    const http = openRouter({ apiKey: "k", fetchFn: async () => new Response("nope", { status: 402 }) });
    await expect(http.edit({ bytes: PNG, type: "image/png" }, "p")).rejects.toThrow(/OpenRouter: HTTP 402/);
    const gif = openRouter({ apiKey: "k", fetchFn: async () => imageReply(`data:image/gif;base64,${toBase64(new Uint8Array([71, 73, 70, 56, 57, 97]))}`) });
    await expect(gif.edit({ bytes: PNG, type: "image/png" }, "p")).rejects.toThrow(/isn't a PNG, JPEG or WebP/);
  });

  test("the model can be overridden", async () => {
    let model = "";
    const ai = openRouter({ apiKey: "k", model: "google/other", fetchFn: async (_u, init) => {
      model = JSON.parse(String(init!.body)).model;
      return imageReply(`data:image/png;base64,${toBase64(PNG)}`);
    } });
    await ai.edit({ bytes: PNG, type: "image/png" }, "p");
    expect(model).toBe("google/other");
  });
});

describe("openRouter.credits", () => {
  test("credits left in dollars, or null when unreadable", async () => {
    expect(await openRouter({ apiKey: "k", fetchFn: async () => ok({ data: { total_credits: 10, total_usage: 7.456 } }) }).credits()).toBe(2.54);
    expect(await openRouter({ apiKey: "k", fetchFn: async () => new Response("x", { status: 500 }) }).credits()).toBeNull();
    expect(await openRouter({ apiKey: "k", fetchFn: async () => { throw new Error("offline"); } }).credits()).toBeNull();
  });
});
