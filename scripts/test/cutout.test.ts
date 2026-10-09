import { expect, test } from "vitest";
import sharp from "sharp";
import { backgroundMask, contentBox, cutout, CUT_SIZE, MAX_CUT_BYTES } from "../cutout-lib.mjs";

const BG = [35, 24, 62];
const FG = [150, 230, 190];

// width x height, background colour everywhere, `paint` lists [x, y, rgb] pixels to change
function image(width: number, height: number, paint: [number, number, number[]][]): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) px.set([...BG, 255], i * 4);
  for (const [x, y, rgb] of paint) px.set([...rgb, 255], (y * width + x) * 4);
  return px;
}

// a 3x3 ring of character pixels at (1..3, 1..3) whose middle pixel has the background colour
const ring: [number, number, number[]][] = [];
for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) if (x !== 2 || y !== 2) ring.push([x, y, FG]);

test("the background is found from the edges", () => {
  const mask = backgroundMask(image(5, 5, ring), 5, 5);
  expect(mask[0]).toBe(1);
  expect(mask[4 * 5 + 4]).toBe(1);
  expect(mask[1 * 5 + 1]).toBe(0);
});

test("a background-coloured pixel inside the character is kept", () => {
  const mask = backgroundMask(image(5, 5, ring), 5, 5);
  expect(mask[2 * 5 + 2]).toBe(0);
});

test("colours close to the background (within the tolerance) count as background", () => {
  const near = [BG[0] + 10, BG[1] + 10, BG[2] + 10];
  const mask = backgroundMask(image(3, 1, [[1, 0, near]]), 3, 1);
  expect([...mask]).toEqual([1, 1, 1]);
});

test("the content box wraps the character", () => {
  const mask = backgroundMask(image(5, 5, ring), 5, 5);
  expect(contentBox(mask, 5, 5)).toEqual({ left: 1, top: 1, width: 3, height: 3 });
});

test("cutout makes a 512 square webp with a transparent background and the character standing on the bottom edge", async () => {
  const w = 40, h = 40;
  const paint: [number, number, number[]][] = [];
  for (let y = 10; y < 30; y++) for (let x = 15; x < 25; x++) paint.push([x, y, FG]);
  const png = await sharp(Buffer.from(image(w, h, paint)), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const out = await cutout(png);
  expect(out.length).toBeLessThanOrEqual(MAX_CUT_BYTES);
  const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([CUT_SIZE, CUT_SIZE]);
  const alpha = (x: number, y: number) => data[(y * CUT_SIZE + x) * 4 + 3];
  expect(alpha(0, 0)).toBe(0);
  expect(alpha(CUT_SIZE / 2, CUT_SIZE - 2)).toBeGreaterThan(200);
});
