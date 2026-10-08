// In-flight payments and launches, and when it is safe to forget them.
// Rule: a remembered payment/launch is cleared only once it has definitely resolved: success, a definitive 4xx from the
// server (400/404/409), or its transaction can no longer land.
// Expiry approach (the same for both): every record keeps the transaction's signature and the recent blockhash it was
// built on. It "can no longer land" only when, in this order, isBlockhashValid(blockhash, confirmed) says false and THEN
// getSignatureStatuses shows nothing (or an on-chain error) from a node that is at least as far along as the one that
// judged the blockhash (status context.slot >= blockhash context.slot). A transaction can land between the two calls,
// and nodes can lag, so anything else keeps the record.
import { SendTransactionError, type Connection } from "@solana/web3.js";
import { ApiError } from "./functions";

export interface Expiry {
  blockhash: string;
}
interface Ctx { context: { slot: number } }
export interface ChainView {
  getSignatureStatuses(signatures: string[], config: { searchTransactionHistory: boolean }): Promise<Ctx & { value: ({ err: unknown } | null)[] }>;
  isBlockhashValid(blockhash: string, config: { commitment: "confirmed" }): Promise<Ctx & { value: boolean }>;
}

// The server was asked for the result for the whole wait and still said "waiting".
export class StillWaiting extends Error {}

// The RPC node refused the transaction (preflight simulation failed, or another JSON-RPC error answer), so it was never
// broadcast: the remembered record can be forgotten at once instead of waiting ~90 s for the blockhash to expire.
// Network failures (no answer) are NOT this: the transaction may have gone out.
export class NotSent extends Error {}

export async function sendRaw(connection: Pick<Connection, "sendRawTransaction">, raw: Uint8Array): Promise<string> {
  try {
    return await connection.sendRawTransaction(raw, { maxRetries: 5 });
  } catch (e) {
    if (e instanceof SendTransactionError) {
      const why = (e.transactionError.message || "").replace(/\.$/, "");
      throw new NotSent(`Solana refused the transaction${why ? ` (${why})` : ""}, so nothing was sent. You can try again.`);
    }
    throw e;
  }
}

export const isDefinitive = (e: unknown): e is ApiError => e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409);

export async function canNoLongerLand(chain: ChainView, signature: string, expiry: Expiry): Promise<boolean> {
  const hash = await chain.isBlockhashValid(expiry.blockhash, { commitment: "confirmed" });
  if (hash.value) return false; // it can still land
  const statuses = await chain.getSignatureStatuses([signature], { searchTransactionHistory: true });
  if (statuses.context.slot < hash.context.slot) return false; // the status node is behind the one that judged the blockhash
  const status = statuses.value[0] ?? null;
  return !status || status.err != null; // never seen, or failed on chain
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
