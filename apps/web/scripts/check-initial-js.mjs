// Fails when three.js or ogl is in the home page's initial JavaScript: both must load lazily (next/dynamic,
// ssr: false). Run after a build: node apps/web/scripts/check-initial-js.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve(import.meta.dirname, "..", "out");
const MARKERS = { three: "WebGLRenderer", ogl: "unable to create webgl context" }; // strings minifiers keep

// every script the exported home page references (script tags, preloads and the inline RSC payload)
const html = readFileSync(path.join(out, "index.html"), "utf8");
const initial = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s\\]+?\.js/g)].map((m) => m[0]))];
if (!initial.length) throw new Error("No scripts found in out/index.html: build first.");

const all = readdirSync(path.join(out, "_next", "static", "chunks"), { recursive: true })
  .filter((f) => String(f).endsWith(".js"))
  .map((f) => `/_next/static/chunks/${String(f).replaceAll("\\", "/")}`);
const has = (file, marker) => readFileSync(path.join(out, file), "utf8").includes(marker);

let failed = false;
for (const [lib, marker] of Object.entries(MARKERS)) {
  const lazy = all.filter((f) => has(f, marker));
  const eager = initial.filter((f) => has(f, marker));
  console.log(`${lib}: in ${lazy.length} chunk(s) overall, ${eager.length} of them in the home page's initial JS`);
  if (!lazy.length) { console.error(`  ${lib} wasn't found at all: is the marker still right?`); failed = true; }
  for (const f of eager) { console.error(`  initial: ${f}`); failed = true; }
}
console.log(`checked ${initial.length} initial script(s)`);
process.exit(failed ? 1 : 0);
