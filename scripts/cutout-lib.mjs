// The scroll intro's cut-outs (spec 2026-10-09-spookpad-intro-stage-design.md): the showcase art's solid background
// made transparent by a flood fill from the image edges, so a background-coloured pixel inside the character stays.
import sharp from "sharp";

export const TOLERANCE = 20;      // colour distance from the corner pixel that still counts as background (40 ate the skeleton's black suit)
export const CUT_SIZE = 512;
export const MAX_CUT_BYTES = 120_000;

// rgba: width * height * 4 bytes. Returns 1 for each background pixel, 0 for the character.
export function backgroundMask(rgba, width, height, tolerance = TOLERANCE) {
  const bg = [rgba[0], rgba[1], rgba[2]];
  const near = (i) => Math.hypot(rgba[i * 4] - bg[0], rgba[i * 4 + 1] - bg[1], rgba[i * 4 + 2] - bg[2]) < tolerance;
  const mask = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (!seen[i]) { seen[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    if (!near(i)) continue;
    mask[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return mask;
}

// The smallest rectangle holding every character pixel (mask 0).
export function contentBox(mask, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error("no character found: the whole picture matched the background");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Transparent background, trimmed to the character, then centred on a square with its feet on the bottom edge (the
// scene stands each cut-out on the floor at its bottom edge).
export async function cutout(bytes, size = CUT_SIZE) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = backgroundMask(data, info.width, info.height);
  for (let i = 0; i < mask.length; i++) if (mask[i]) data.fill(0, i * 4, i * 4 + 4);
  const box = contentBox(mask, info.width, info.height);
  const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box).png().toBuffer();
  for (const quality of [82, 72, 62]) {
    const out = await sharp(trimmed)
      .resize(size, size, { fit: "contain", position: "bottom", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality, alphaQuality: 90, effort: 5 })
      .toBuffer();
    if (out.length <= MAX_CUT_BYTES) return out;
  }
  throw new Error(`cut-out is over ${MAX_CUT_BYTES} bytes even at quality 62`);
}
