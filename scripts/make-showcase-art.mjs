// One-off: makes the home page's showcase art (redesign spec "Mascot artwork"). Generates the bare SpookPad mascot
// with OpenRouter's image model, then dresses it in every seed costume with the production prompt (buildPrompt) and
// the production client (packages/functions/src/openrouter.ts), and writes apps/web/public/showcase/<slug>.webp
// (square, at most 200 KB). The full-size PNGs go to .data/showcase/ (gitignored). About $0.25 of OpenRouter credit.
//   npm run showcase-art                  everything: a new bare mascot, then all 7 costumes
//   npm run showcase-art -- --only witch  one image again (costumes are dressed from .data/showcase/plain.png)
// OPENROUTER_API_KEY comes from the environment or from .env.secrets at the repo root. It is never printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { buildPrompt, SEED_COSTUMES } from "../packages/core/src/costumes.ts";
import { DEFAULT_MODEL, openRouter } from "../packages/functions/src/openrouter.ts";
import { encodeShowcase, generateImage, MASCOT_PROMPT, parseArgs, readSecret, SHOWCASE_SLUGS } from "./showcase-art-lib.mjs";

const OUT = "apps/web/public/showcase";
const RAW = ".data/showcase";

const { only } = parseArgs(process.argv.slice(2));
const apiKey = process.env.OPENROUTER_API_KEY
  || (existsSync(".env.secrets") ? readSecret(readFileSync(".env.secrets", "utf8"), "OPENROUTER_API_KEY") : "");
if (!apiKey) throw new Error("Set OPENROUTER_API_KEY, or put it in .env.secrets at the repo root.");
const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL; // the production costume model
const ai = openRouter({ apiKey, model });
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const targets = only ? [only] : SHOWCASE_SLUGS;
const write = async (slug, bytes) => {
  writeFileSync(`${RAW}/${slug}.png`, await sharp(bytes).png().toBuffer());
  const webp = await encodeShowcase(bytes);
  writeFileSync(`${OUT}/${slug}.webp`, webp);
  console.log(`wrote ${OUT}/${slug}.webp (${Math.round(webp.length / 1024)} KB)`);
};

if (targets.includes("plain")) {
  await write("plain", await generateImage({ apiKey, model, prompt: MASCOT_PROMPT }));
  if (only) console.log("The costumes were dressed from the old mascot: run without --only to make them all again.");
}

const costumes = SEED_COSTUMES.filter((c) => targets.includes(c.slug));
if (costumes.length) {
  const plain = existsSync(`${RAW}/plain.png`)
    ? readFileSync(`${RAW}/plain.png`)
    : await sharp(readFileSync(`${OUT}/plain.webp`)).png().toBuffer();
  for (const c of costumes) {
    const out = await ai.edit({ bytes: new Uint8Array(plain), type: "image/png" }, buildPrompt(c.prompt));
    await write(c.slug, out.bytes);
  }
}
console.log(`OpenRouter credit left: $${await ai.credits()}`);
