// Checks that a confirmed Solana transaction pays a costume's fee (spec §4.1): paid and signed by the trader's wallet,
// a SOL transfer of at least the fee to the treasury, and the memo "spookpad:<generation id>". Works on the RPC's
// jsonParsed getTransaction result. Pure: fetching is the caller's job.
import { lamportsToSol } from "./sol";

export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

export const feeMemo = (generationId: string): string => `spookpad:${generationId}`;

export interface ParsedInstruction {
  programId: string;
  program?: string;
  parsed?: unknown;
  accounts?: string[]; // instructions the RPC can't parse (e.g. pump.fun) come as accounts + base58 data
  data?: string;
}
export interface ParsedTransaction {
  blockTime?: number | null;
  meta: { err: unknown } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: { pubkey: string; signer: boolean }[];
      instructions: ParsedInstruction[];
    };
  };
}

interface TransferInfo { source?: string; destination?: string; lamports?: number }

// a System transfer of at least `lamports` from `from` to `to`
export function paysAtLeast(tx: ParsedTransaction, from: string, to: string, lamports: number): boolean {
  return tx.transaction.message.instructions.some((i) => {
    if (i.programId !== SYSTEM_PROGRAM_ID) return false;
    const p = i.parsed as { type?: string; info?: TransferInfo } | undefined;
    return p?.type === "transfer" && p.info?.source === from && p.info?.destination === to && Number(p.info?.lamports) >= lamports;
  });
}

// null when `tx` pays the fee; otherwise the reason, worded for the person paying.
export function checkFeePayment(tx: ParsedTransaction, want: { wallet: string; treasury: string; lamports: number; memo: string }): string | null {
  if (!tx.meta || tx.meta.err !== null) return "That payment failed on-chain.";
  const payer = tx.transaction.message.accountKeys[0];
  if (!payer || payer.pubkey !== want.wallet || !payer.signer) return "The payment must come from your signed-in wallet.";
  const memos = tx.transaction.message.instructions.filter((i) => i.programId === MEMO_PROGRAM_ID && typeof i.parsed === "string");
  const spookMemos = memos.filter((i) => (i.parsed as string).startsWith("spookpad:"));
  // one payment, one costume: a transaction naming several generations can't be reused for each of them
  if (spookMemos.length > 1 || !memos.some((i) => i.parsed === want.memo)) {
    return "That payment isn't for this costume.";
  }
  if (!paysAtLeast(tx, want.wallet, want.treasury, want.lamports)) {
    return `That payment doesn't send ${lamportsToSol(want.lamports)} SOL to the SpookPad treasury.`;
  }
  return null;
}
