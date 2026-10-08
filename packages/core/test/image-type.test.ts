import { expect, test } from "vitest";
import { EXT, MAX_COSTUME_BYTES, MAX_ORIGINAL_BYTES, sniffImageType } from "../src/image-type";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

test("recognizes PNG, JPEG and WebP by their first bytes", () => {
  expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  expect(sniffImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("image/webp");
});

test("refuses GIF and anything else", () => {
  expect(sniffImageType(bytes(...ascii("GIF89a")))).toBeNull();
  expect(sniffImageType(new Uint8Array([1, 2]))).toBeNull();
});

test("limits and extensions", () => {
  expect(MAX_ORIGINAL_BYTES).toBe(3 * 1024 * 1024);
  expect(MAX_COSTUME_BYTES).toBe(8 * 1024 * 1024);
  expect(EXT).toEqual({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" });
});
