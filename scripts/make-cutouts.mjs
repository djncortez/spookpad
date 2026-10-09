// Makes the scroll intro's cut-outs: apps/web/public/showcase/<slug>.webp -> apps/web/public/showcase/cut/<slug>.webp.
// Run once with `npm run cutouts`; the owner approves the results before they are committed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cutout } from "./cutout-lib.mjs";

const SRC = path.resolve(import.meta.dirname, "..", "apps", "web", "public", "showcase");
const OUT = path.join(SRC, "cut");
mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".webp"))) {
  const out = await cutout(readFileSync(path.join(SRC, file)));
  writeFileSync(path.join(OUT, file), out);
  console.log(`${file}: ${(out.length / 1024).toFixed(0)} KB`);
}
