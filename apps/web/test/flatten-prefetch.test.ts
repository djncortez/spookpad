import { afterEach, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { flattenPrefetch } from "../scripts/flatten-prefetch.mjs";

let out = "";
afterEach(() => { if (out) rmSync(out, { recursive: true, force: true }); });

test("copies each page's prefetch file to the dotted name the browser asks for, keeping the original", () => {
  out = mkdtempSync(path.join(tmpdir(), "flatten-"));
  mkdirSync(path.join(out, "submit", "__next.submit"), { recursive: true });
  writeFileSync(path.join(out, "submit", "__next.submit", "__PAGE__.txt"), "page");
  writeFileSync(path.join(out, "submit", "__next._tree.txt"), "tree");
  mkdirSync(path.join(out, "a", "b", "__next.a.b", "x"), { recursive: true });
  writeFileSync(path.join(out, "a", "b", "__next.a.b", "x", "__PAGE__.txt"), "deep");

  const made = flattenPrefetch(out).map((p: string) => path.relative(out, p).split(path.sep).join("/")).sort();
  expect(made).toEqual(["a/b/__next.a.b.x.__PAGE__.txt", "submit/__next.submit.__PAGE__.txt"]);
  expect(readFileSync(path.join(out, "submit", "__next.submit.__PAGE__.txt"), "utf8")).toBe("page");
  expect(readFileSync(path.join(out, "submit", "__next.submit", "__PAGE__.txt"), "utf8")).toBe("page");
});
