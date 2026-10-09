import { expect, test } from "vitest";
import { BREW_LINES, brewLine } from "../lib/brew";

test("status lines rotate in order and loop", () => {
  expect(brewLine(0)).toBe(BREW_LINES[0]);
  expect(brewLine(1)).toBe(BREW_LINES[1]);
  expect(brewLine(BREW_LINES.length)).toBe(BREW_LINES[0]);
  expect(brewLine(-1)).toBe(BREW_LINES[BREW_LINES.length - 1]);
  expect(new Set(BREW_LINES).size).toBe(BREW_LINES.length);
});
