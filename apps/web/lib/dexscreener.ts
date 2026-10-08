// Market caps from DEX Screener's public API (no key; about 300 requests a minute), up to 30 tokens a call. Used only
// where the chain read can't price a coin (graduated coins on the Graveyard list): it trails trades. A token with
// several pairs keeps its biggest market cap; a failed call just leaves those caps out ("—").
const BATCH = 30;

export async function dexMarketCaps(mints: string[], fetchFn: typeof fetch = fetch): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += BATCH) {
    const batch = mints.slice(i, i + BATCH);
    try {
      const res = await fetchFn(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`);
      if (!res.ok) continue;
      const pairs = (await res.json()) as { baseToken?: { address?: string }; marketCap?: number; fdv?: number }[];
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const mint = p.baseToken?.address;
        const cap = p.marketCap ?? p.fdv;
        if (mint && batch.includes(mint) && typeof cap === "number") out[mint] = Math.max(out[mint] ?? 0, cap);
      }
    } catch {
      // offline or rate-limited: no caps for this batch
    }
  }
  return out;
}
