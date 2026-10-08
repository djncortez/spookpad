// The costume AI (spec §5): OpenRouter's OpenAI-compatible chat completions with image output. One user message holds
// the prompt and the original image (as a data URL); the answer's first image is the costume.
import { fromBase64, toBase64 } from "@spookpad/core/encoding";
import { MAX_COSTUME_BYTES, sniffImageType, type Art } from "@spookpad/core/image-type";

export const DEFAULT_MODEL = "google/gemini-nano-banana-2.1";
const API = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 90_000;

// The model answered without an image (usually a refusal). Its message is shown to the trader.
export class AiRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRefused";
  }
}

export interface CostumeAi {
  edit(original: Art, prompt: string): Promise<Art>;
  credits(): Promise<number | null>; // dollars left, or null when it can't be read
}

export function openRouter(o: { apiKey: string; model?: string; siteUrl?: string; fetchFn?: typeof fetch }): CostumeAi {
  const fetchFn = o.fetchFn ?? fetch;
  const headers: Record<string, string> = {
    authorization: `Bearer ${o.apiKey}`,
    "content-type": "application/json",
    "x-title": "SpookPad",
    ...(o.siteUrl ? { "http-referer": o.siteUrl } : {}),
  };
  return {
    async edit(original, prompt) {
      const res = await fetchFn(`${API}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model: o.model || DEFAULT_MODEL,
          modalities: ["image", "text"],
          image_config: { aspect_ratio: "1:1" },
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${original.type};base64,${toBase64(original.bytes)}` } },
            ],
          }],
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const body = (await res.json()) as { choices?: { message?: { content?: unknown; images?: { image_url?: { url?: unknown } }[] } }[] };
      const message = body.choices?.[0]?.message;
      const url = message?.images?.[0]?.image_url?.url;
      if (typeof url !== "string") {
        const text = typeof message?.content === "string" ? message.content.trim() : "";
        throw new AiRefused(`The AI didn't return a costume.${text ? ` It said: "${text.slice(0, 160)}"` : ""}`);
      }
      const m = /^data:image\/[a-z+.-]+;base64,(.+)$/s.exec(url);
      if (!m) throw new Error("OpenRouter: the image isn't a base64 data URL");
      const bytes = fromBase64(m[1]);
      const type = sniffImageType(bytes);
      if (!type) throw new Error("OpenRouter: the image isn't a PNG, JPEG or WebP");
      if (bytes.length > MAX_COSTUME_BYTES) throw new Error("OpenRouter: the image is too big");
      return { bytes, type };
    },
    async credits() {
      try {
        const res = await fetchFn(`${API}/credits`, { headers });
        if (!res.ok) return null;
        const d = ((await res.json()) as { data?: { total_credits?: unknown; total_usage?: unknown } }).data;
        const total = Number(d?.total_credits);
        const used = Number(d?.total_usage);
        return Number.isFinite(total) && Number.isFinite(used) ? Math.round((total - used) * 100) / 100 : null;
      } catch {
        return null;
      }
    },
  };
}
