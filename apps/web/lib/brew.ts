// The spooky status lines that rotate under the cauldron while the AI works.
export const BREW_EVERY_MS = 2500;
export const BREW_LINES = [
  "Stirring the cauldron…",
  "Adding a pinch of moonlight…",
  "Stitching the costume…",
  "Asking the bats for a second opinion…",
  "Letting the potion bubble…",
  "Almost ready to haunt…",
] as const;

export const brewLine = (tick: number): string => {
  const n = BREW_LINES.length;
  return BREW_LINES[((Math.floor(tick) % n) + n) % n];
};
