// Runs after `next build` (postbuild). Next 16's static export writes a page's prefetch data as
// out/submit/__next.submit/__PAGE__.txt, but the browser asks for out/submit/__next.submit.__PAGE__.txt, so every
// link prefetch 404s (links still work, just slower, with console errors). Copy each such file to the dotted name.
import { copyFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// every file under a "__next.*" folder, copied beside that folder with the path joined by dots; returns the copies
export function flattenPrefetch(outDir) {
  const made = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (name.startsWith("__next.")) {
        const copyAll = (sub, prefix) => {
          for (const f of readdirSync(sub)) {
            const p = path.join(sub, f);
            if (statSync(p).isDirectory()) copyAll(p, `${prefix}.${f}`);
            else { const to = path.join(dir, `${prefix}.${f}`); copyFileSync(p, to); made.push(to); }
          }
        };
        copyAll(full, name);
      } else {
        walk(full);
      }
    }
  };
  walk(outDir);
  return made;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
  console.log(`prefetch files flattened: ${flattenPrefetch(out).length}`);
}
