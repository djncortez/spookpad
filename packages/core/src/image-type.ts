// The image types SpookPad accepts (spec §2 step 2), told apart by their first bytes, not by what the sender claims.
export type ImageType = "image/png" | "image/jpeg" | "image/webp";
export interface Art { bytes: Uint8Array; type: ImageType }

export const EXT: Record<ImageType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_ORIGINAL_BYTES = 3 * 1024 * 1024; // the browser sends a 1024 px square
export const MAX_COSTUME_BYTES = 8 * 1024 * 1024;  // what the AI may send back

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  return null;
}
