// Market caps for the whole Graveyard with the $NOOB curve formula, cheaply: every coin's pump.fun bonding curve (a PDA
// of the mint) is read in one getMultipleAccounts call per 100 coins and priced with Jupiter's SOL price. Coins that
// graduated (curve complete) or that the chain read misses use DEX Screener. The coin page runs the full live engine.
import { PublicKey } from "@solana/web3.js";
import { dexMarketCaps } from "./dexscreener";
import { curveMarketCap, PUMP_PROGRAM, readCurve, WSOL, type RpcAccount } from "./live-mcap";

const BATCH = 100; // getMultipleAccounts limit

export const curveAddress = (mint: string): string =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode("bonding-curve"), new PublicKey(mint).toBytes()], new PublicKey(PUMP_PROGRAM))[0].toBase58();

async function solUsd(fetchFn: typeof fetch): Promise<number | null> {
  try {
    const j = (await (await fetchFn(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`)).json()) as Record<string, { usdPrice?: number }>;
    return (j[WSOL]?.usdPrice ?? 0) > 0 ? j[WSOL].usdPrice! : null;
  } catch {
    return null;
  }
}

// Delivers only answers newer than the last one applied: a slow read that finishes after a newer one is dropped, and a
// failed read changes nothing (the last good caps stay).
export function newestOnly<T>(apply: (value: T) => void): (read: Promise<T>) => Promise<void> {
  let asked = 0;
  let applied = 0;
  return (read) => {
    const n = ++asked;
    return read.then((value) => { if (n > applied) { applied = n; apply(value); } }, () => {});
  };
}

export async function graveyardCaps(mints: string[], rpcUrl: string, fetchFn: typeof fetch = fetch): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const sol = rpcUrl && mints.length ? await solUsd(fetchFn) : null;
  if (sol) {
    for (let i = 0; i < mints.length; i += BATCH) {
      const batch = mints.slice(i, i + BATCH);
      try {
        const res = await fetchFn(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [batch.map(curveAddress), { encoding: "base64", commitment: "processed" }] }),
        });
        const values = ((await res.json()) as { result?: { value: (RpcAccount | null)[] } }).result?.value ?? [];
        batch.forEach((mint, j) => {
          const c = readCurve(values[j]);
          if (c && !c.complete) out[mint] = curveMarketCap(c, 9, sol); // pump.fun curves are quoted in SOL
        });
      } catch {
        // this batch falls back to DEX Screener
      }
    }
  }
  return { ...(await dexMarketCaps(mints.filter((m) => !(m in out)), fetchFn)), ...out };
}
