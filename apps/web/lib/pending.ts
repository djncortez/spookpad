// In-flight payments and launches, and when it is safe to forget them.
// Rule: a remembered payment/launch is cleared only once it has definitely resolved: success, a definitive 4xx from the
// server (400/404/409), or its transaction can no longer land.
// Expiry approach (the same for both): every record keeps the transaction's signature and the recent blockhash it was
// built on. It "can no longer land" when getSignatureStatuses shows nothing for the signature (or an on-chain error)
// AND isBlockhashValid(blockhash, confirmed) is false. (prepare-launch doesn't return a lastValidBlockHeight, so the
// blockhash check is used for both; the fee also records lastValidBlockHeight from the getLatestBlockhash it was built on.)
import { ApiError } from "./functions";

export interface Expiry {
  blockhash: string;
  lastValidBlockHeight?: number;
}
export interface ChainView {
  getSignatureStatuses(signatures: string[], config: { searchTransactionHistory: boolean }): Promise<{ value: ({ err: unknown } | null)[] }>;
  isBlockhashValid(blockhash: string, config: { commitment: "confirmed" }): Promise<{ value: boolean }>;
}

// The server was asked for the result for the whole wait and still said "waiting".
export class StillWaiting extends Error {}

export const isDefinitive = (e: unknown): e is ApiError => e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409);

export async function canNoLongerLand(chain: ChainView, signature: string, expiry: Expiry): Promise<boolean> {
  const { value } = await chain.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const status = value[0] ?? null;
  if (status) return status.err != null; // seen: only a failed transaction is over
  return !(await chain.isBlockhashValid(expiry.blockhash, { commitment: "confirmed" })).value;
}

export type Checked<T> = { kind: "done"; value: T } | { kind: "cleared"; message: string } | { kind: "keep" };

// Runs a "check again" call and says whether the remembered record should be cleared.
export async function checkPending<T>(run: () => Promise<T>, chain: ChainView, signature: string, expiry: Expiry, goneMessage: string): Promise<Checked<T>> {
  try {
    return { kind: "done", value: await run() };
  } catch (e) {
    if (isDefinitive(e)) return { kind: "cleared", message: e.message };
    if (!(e instanceof StillWaiting)) throw e;
    return (await canNoLongerLand(chain, signature, expiry)) ? { kind: "cleared", message: goneMessage } : { kind: "keep" };
  }
}
