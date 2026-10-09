// The three "How it works" cards. Fees come from the public settings view, never from constants.
import { solText } from "./format";
import type { PublicSettings } from "./public-data";

export interface Step { n: 1 | 2 | 3; emoji: string; title: string; body: string }

export function howItWorksSteps(settings: Pick<PublicSettings, "costume_fee_lamports" | "launch_fee_lamports"> | null): Step[] {
  const costumeFee = settings ? solText(settings.costume_fee_lamports) : "…";
  const launchFee = settings ? solText(settings.launch_fee_lamports) : "…";
  return [
    { n: 1, emoji: "🖼️", title: "Upload your mascot", body: "Any PNG, JPG or WebP: your coin's own character, exactly as you drew it." },
    { n: 2, emoji: "🪄", title: "Pick a costume", body: `AI dresses your mascot in seconds. Each costume costs ${costumeFee}, and a failed one is retried for free.` },
    { n: 3, emoji: "🎃", title: "Launch on pump.fun", body: `You launch from your own wallet, so pump.fun's creator fees are yours. SpookPad's launch fee is ${launchFee}.` },
  ];
}
