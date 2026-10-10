// Sharing a coin (spec 2026-10-09-spookpad-podium-party-design.md): the post text and the links, kept pure so they
// are tested; ShareButtons and the share card use them.
import type { GraveCoin } from "./graveyard";

export const SITE = "spookpad.xyz";

export const pumpUrl = (mint: string): string => `https://pump.fun/coin/${mint}`;

export const coinPageUrl = (origin: string, mint: string): string => `${origin.replace(/\/+$/, "")}/coin/?mint=${mint}`;

// where LaunchWizard sends the trader after a launch: the coin page, with the one-off launch party
export const partyUrl = (mint: string): string => `/coin/?mint=${mint}&party=1`;

export function shareText(coin: Pick<GraveCoin, "name" | "ticker">, costume: string | undefined): string {
  const dressed = costume ? `dressed as a ${costume}` : "in costume";
  return `${coin.name} ($${coin.ticker}) just rose from the grave ${dressed}. Launched on ${SITE}`;
}

export function xIntentUrl(text: string, url: string): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set("text", text);
  u.searchParams.set("url", url);
  return u.toString();
}
