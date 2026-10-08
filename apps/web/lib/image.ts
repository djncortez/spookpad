// Turns the picked file into the 1024 px square the costume AI gets, cut from the center (spec §2 step 2). PNG keeps
// transparency; a JPEG is used when the PNG would be over 3 MB. Browser only.
import { toBase64 } from "@spookpad/core/encoding";

export interface PreparedImage { base64: string; previewUrl: string }

const SIDE = 1024;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image. Try another file."))), type, quality));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Pick a PNG, JPG or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That file is too big. Pick an image under 20 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that image. Try another file.");
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser can't prepare images here. Try another browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
    let blob = await toBlob(canvas, "image/png");
    if (blob.size > MAX_OUTPUT_BYTES) blob = await toBlob(canvas, "image/jpeg", 0.9);
    if (blob.size > MAX_OUTPUT_BYTES) throw new Error("That image is too detailed. Try a simpler one.");
    return { base64: toBase64(new Uint8Array(await blob.arrayBuffer())), previewUrl: URL.createObjectURL(blob) };
  } finally {
    bitmap.close();
  }
}
