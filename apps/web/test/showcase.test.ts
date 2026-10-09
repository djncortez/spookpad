import { describe, expect, test } from "vitest";
import { CYCLE_MS, GALLERY_ITEMS, heroFrame, SHOWCASE, STILL_INDEX } from "../lib/showcase";

test("the hero cycles plain, then the seven costumes, every 3 s", () => {
  expect(SHOWCASE.map((c) => c.slug)).toEqual(["plain", "ghost", "witch", "vampire", "pumpkin", "mummy", "skeleton", "devil"]);
  expect(SHOWCASE[2]).toEqual({ slug: "witch", label: "Witch", emoji: "🧙", src: "/showcase/witch.webp" });
  expect(CYCLE_MS).toBe(3000);
  expect(SHOWCASE[STILL_INDEX].slug).toBe("ghost");
});

test("the gallery shows the seven costumes with emoji and name", () => {
  expect(GALLERY_ITEMS).toHaveLength(7);
  expect(GALLERY_ITEMS[0]).toEqual({ image: "/showcase/ghost.webp", text: "👻 Ghost sheet" });
});

describe("heroFrame", () => {
  test("starts on plain, then alternates slots", () => {
    expect(heroFrame(0, 8)).toEqual({ current: 0, slotA: 0, slotB: 7, showB: false });
    expect(heroFrame(1, 8)).toEqual({ current: 1, slotA: 0, slotB: 1, showB: true });
    expect(heroFrame(2, 8)).toEqual({ current: 2, slotA: 2, slotB: 1, showB: false });
  });
  test("loops after devil", () => {
    expect(heroFrame(7, 8).current).toBe(7);
    expect(heroFrame(8, 8)).toEqual({ current: 0, slotA: 0, slotB: 7, showB: false });
  });
  test("the visible slot shows the current costume, and the slot being hidden keeps the previous one", () => {
    for (let s = 1; s < 40; s++) {
      const before = heroFrame(s - 1, 8);
      const now = heroFrame(s, 8);
      expect(now.showB ? now.slotB : now.slotA).toBe(now.current);
      const leaving = before.showB ? "slotB" : "slotA";
      expect(now[leaving]).toBe(before[leaving]);
    }
  });
});
