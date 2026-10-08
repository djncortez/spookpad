import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "supabase/tests/**/*.test.ts",
      "scripts/test/**/*.test.ts",
      "apps/web/test/**/*.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 120_000, // embedded Postgres takes a few seconds to start
    pool: "forks",
  },
});
