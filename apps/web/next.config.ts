import type { NextConfig } from "next";
import path from "node:path";

// One .env at the repo root for everything; Next only reads its own folder's .env files by default.
// On Netlify there is no .env: the variables come from the site's environment settings.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "..", "..", ".env"));
} catch (err) {
  if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
}

const nextConfig: NextConfig = {
  output: "export",          // static files only: Netlify serves them from its CDN
  trailingSlash: true,       // /launch/ -> out/launch/index.html
  images: { unoptimized: true },
  transpilePackages: ["@spookpad/core"],
};

export default nextConfig;
