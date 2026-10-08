// Opt-in quality check against the real AI (costs about $0.03 per costume). Skipped unless OPENROUTER_API_KEY and
// SAMPLE_IMAGE (a PNG/JPEG/WebP mascot) are set. Writes .data/costumes/<slug>.<ext> to look at:
//   OPENROUTER_API_KEY=sk-or-... SAMPLE_IMAGE=./mascot.png npx vitest run packages/functions/test/live-costume.test.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buildPrompt, SEED_COSTUMES } from "@spookpad/core/costumes";
import { EXT, sniffImageType } from "@spookpad/core/image-type";
import { openRouter } from "../src/openrouter";

const key = process.env.OPENROUTER_API_KEY;
const sample = process.env.SAMPLE_IMAGE;
const only = process.env.COSTUME; // e.g. COSTUME=ghost to try one

test.skipIf(!key || !sample)("every costume comes back as an image", async () => {
  const bytes = new Uint8Array(readFileSync(sample!));
  const type = sniffImageType(bytes);
  expect(type, "SAMPLE_IMAGE must be a PNG, JPEG or WebP").not.toBeNull();
  const ai = openRouter({ apiKey: key!, model: process.env.OPENROUTER_MODEL });
  mkdirSync(".data/costumes", { recursive: true });
  for (const c of SEED_COSTUMES.filter((s) => !only || s.slug === only)) {
    const out = await ai.edit({ bytes, type: type! }, buildPrompt(c.prompt));
    writeFileSync(`.data/costumes/${c.slug}.${EXT[out.type]}`, out.bytes);
    console.log(`wrote .data/costumes/${c.slug}.${EXT[out.type]}`);
  }
  console.log(`OpenRouter credit left: $${await ai.credits()}`);
}, 600_000);
