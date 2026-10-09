// The 1200 x 675 share card (spec 2026-10-09-spookpad-podium-party-design.md): the costumed art and the coin's name,
// drawn in a canvas in the browser. The art comes from Supabase Storage, which answers access-control-allow-origin: *,
// so the canvas stays exportable.
import { SITE } from "./share";

export const CARD_W = 1200;
export const CARD_H = 675;

export interface CardCoin { name: string; ticker: string; costume: string | undefined; art: string }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load the coin's picture"));
    img.src = src;
  });
}

// next/font names its families itself; the layout publishes them as CSS variables
const family = (variable: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;

// the largest size (down to `min`) at which `text` fits in `width`
function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, min: number, width: number): number {
  for (let px = max; px > min; px -= 4) {
    g.font = font(px);
    if (g.measureText(text).width <= width) return px;
  }
  g.font = font(min);
  return min;
}

export async function drawShareCard(coin: CardCoin): Promise<Blob> {
  const display = family("--font-creepster", "cursive");
  const sans = family("--font-grotesk", "system-ui, sans-serif");
  await Promise.all([document.fonts.load(`80px ${display}`), document.fonts.load(`700 40px ${sans}`)]).catch(() => {});
  const img = await loadImage(coin.art);

  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext("2d")!;

  const bg = g.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#2a1846");
  bg.addColorStop(1, "#0d0a14");
  g.fillStyle = bg;
  g.fillRect(0, 0, CARD_W, CARD_H);
  const glow = g.createRadialGradient(330, 340, 40, 330, 340, 420);
  glow.addColorStop(0, "rgba(255,122,26,0.35)");
  glow.addColorStop(1, "rgba(255,122,26,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, CARD_W, CARD_H);

  // the costumed art, rounded, with a pumpkin frame
  const size = 520, x = 70, y = (CARD_H - size) / 2, r = 40;
  g.save();
  g.beginPath();
  g.roundRect(x, y, size, size, r);
  g.clip();
  const side = Math.min(img.naturalWidth, img.naturalHeight); // cover: the centre square of the picture
  g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, x, y, size, size);
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = "#ff7a1a";
  g.beginPath();
  g.roundRect(x, y, size, size, r);
  g.stroke();

  const tx = 650, tw = CARD_W - tx - 60;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#ff7a1a";
  fit(g, coin.name, (px) => `${px}px ${display}`, 96, 44, tw);
  g.fillText(coin.name, tx, 230);
  g.fillStyle = "#f4f1ea";
  g.font = `700 48px ${sans}`;
  g.fillText(`$${coin.ticker}`, tx, 300);
  g.fillStyle = "#a79fb8";
  g.font = `500 34px ${sans}`;
  g.fillText(coin.costume ? `dressed as a ${coin.costume}` : "in costume", tx, 360);
  g.fillStyle = "#f4f1ea";
  fit(g, "Launched on SpookPad", (px) => `${px}px ${display}`, 52, 32, tw);
  g.fillText("Launched on SpookPad", tx, 470);
  g.fillStyle = "#a79fb8";
  g.font = `500 28px ${sans}`;
  g.fillText(SITE, tx, 600);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("could not export the card"))), "image/png"));
}
