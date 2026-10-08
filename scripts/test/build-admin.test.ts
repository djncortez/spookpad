import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { buildAdmin } from "../build-admin.mjs";

let web: string;
beforeEach(() => {
  web = mkdtempSync(path.join(tmpdir(), "spookpad-web-"));
  mkdirSync(path.join(web, "admin"));
  mkdirSync(path.join(web, "public"));
  writeFileSync(path.join(web, "admin", "index.html"), '<script>const API = "%%ADMIN_API%%";</script>');
});
const build = (slug: string, supabaseUrl = "https://abc.supabase.co/") => buildAdmin({ slug, supabaseUrl, webDir: web });

test("publishes the page at the slug with the admin API filled in", () => {
  expect(build("hq-7f3k2q9x")).toBe("hq-7f3k2q9x");
  const html = readFileSync(path.join(web, "public", "hq-7f3k2q9x", "index.html"), "utf8");
  expect(html).toContain('const API = "https://abc.supabase.co/functions/v1/admin";');
  expect(readFileSync(path.join(web, "public", "hq-7f3k2q9x", ".gitignore"), "utf8")).toBe("*\n");
});

test("writes private-page headers for the slug", () => {
  build("hq-7f3k2q9x");
  const headers = readFileSync(path.join(web, "public", "_headers"), "utf8");
  expect(headers).toContain("/hq-7f3k2q9x/*");
  expect(headers).toContain("X-Robots-Tag: noindex, nofollow");
  expect(headers).toContain("Cache-Control: no-store");
});

test("removes the page published under an old slug", () => {
  build("old-slug-1234");
  build("new-slug-5678");
  expect(existsSync(path.join(web, "public", "old-slug-1234"))).toBe(false);
  expect(existsSync(path.join(web, "public", "new-slug-5678", "index.html"))).toBe(true);
});

test("refuses short, unsafe or reserved slugs", () => {
  for (const bad of ["", "short", "has space here", "../../etc", "profile", "how-it-works"]) {
    expect(() => build(bad), bad).toThrow(/ADMIN_SLUG/);
  }
});

test("never overwrites a real folder that isn't the admin page", () => {
  mkdirSync(path.join(web, "public", "images-folder"));
  expect(() => build("images-folder")).toThrow(/already exists/);
});

test("needs the Supabase URL", () => {
  expect(() => build("hq-7f3k2q9x", "")).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
});

test("publishes at the lowercase slug (Netlify lowercases paths)", () => {
  expect(build("HQ-7F3k2q9X")).toBe("hq-7f3k2q9x");
  expect(existsSync(path.join(web, "public", "hq-7f3k2q9x", "index.html"))).toBe(true);
});
