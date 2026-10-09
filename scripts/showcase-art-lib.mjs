// The testable parts of scripts/make-showcase-art.mjs: arguments, the secrets file, the text-to-image call and
// the webp encoding.
import sharp from "sharp";
import { SEED_COSTUMES } from "../packages/core/src/costumes.ts";

export const SHOWCASE_SLUGS = ["plain", ...SEED_COSTUMES.map((c) => c.slug)];
export const MAX_BYTES = 200 * 1024;

// The bare mascot. Original (no existing character), simple shapes, no costume pieces, so every costume reads well.
export const MASCOT_PROMPT =
  "Design an original, cute mascot character for a Halloween meme-coin launchpad called SpookPad: a small, round, " +
  "soft mint-green blob creature with big friendly eyes, a tiny smile and short stubby arms and legs. Simple shapes, " +
  "bold clean outlines, flat cel-shaded cartoon style. Full body, standing, facing the viewer, centered with space " +
  "around it, on a plain deep purple (#1a1230) background. No clothes, no hat, no accessories, no costume, no text, " +
  "no letters, no watermark. Square image.";

// `--only <slug>` regenerates one image; nothing else is accepted.
export function parseArgs(argv) {
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--only") throw new Error(`Unknown option: ${argv[i]}`);
    const slug = argv[++i];
    if (!slug) throw new Error("--only needs a slug, e.g. --only witch");
    if (!SHOWCASE_SLUGS.includes(slug)) throw new Error(`Unknown costume: ${slug}. Use one of ${SHOWCASE_SLUGS.join(", ")}.`);
    only = slug;
  }
  return { only };
}

// One KEY=value from a .env-style file ("" when missing). Quotes are stripped; the value is never printed.
export function readSecret(text, key) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0 || line.slice(0, eq).trim() !== key) continue;
    return line.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return "";
}

// Text-to-image with the same request shape as packages/functions/src/openrouter.ts (no input image).
export async function generateImage({ apiKey, model, prompt, fetchFn = fetch }) {
  const res = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "SpookPad" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "1:1" },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const body = await res.json();
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = typeof url === "string" ? /^data:image\/[a-z+.-]+;base64,(.+)$/s.exec(url) : null;
  if (!m) throw new Error("OpenRouter didn't return an image");
  return new Uint8Array(Buffer.from(m[1], "base64"));
}

// A square webp of at most maxBytes: 768 px first, lower quality, then smaller sizes until it fits.
export async function encodeShowcase(bytes, { maxBytes = MAX_BYTES, sizes = [768, 640, 512] } = {}) {
  for (const size of sizes) {
    for (let quality = 86; quality >= 50; quality -= 8) {
      const out = await sharp(bytes).resize(size, size, { fit: "cover" }).webp({ quality, effort: 5 }).toBuffer();
      if (out.length <= maxBytes) return out;
    }
  }
  throw new Error(`Couldn't get the image under ${maxBytes} bytes`);
}
