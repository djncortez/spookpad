// The three "How it works" cards. Fees come from the public settings view, never from constants.
import { solText } from "./format";
import type { PublicSettings } from "./public-data";

export interface Step { n: 1 | 2 | 3; title: string; body: string }

export function howItWorksSteps(settings: Pick<PublicSettings, "costume_fee_lamports" | "launch_fee_lamports"> | null): Step[] {
  // fee clauses are dropped while the settings are unknown (not loaded yet, or the fetch failed)
  const costumeFee = settings ? `, at ${solText(settings.costume_fee_lamports)} each` : "";
  const launchFee = settings ? ` SpookPad's launch fee is ${solText(settings.launch_fee_lamports)}.` : "";
  return [
    { n: 1, title: "Upload your mascot", body: "Any PNG, JPG or WebP: your coin's own character, exactly as you drew it." },
    { n: 2, title: "Pick a costume", body: `AI dresses your mascot in seconds${costumeFee}, and a failed one is retried for free.` },
    { n: 3, title: "Launch on pump.fun", body: `You launch from your own wallet, so pump.fun's creator fees are yours.${launchFee}` },
  ];
}
