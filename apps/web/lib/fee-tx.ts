// The costume fee: one SOL transfer to the treasury plus a memo naming the generation, signed by the trader's wallet
// (spec §2 step 4). The costume function checks exactly these instructions.
import bs58 from "bs58";
import type { Connection } from "@solana/web3.js";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { MEMO_PROGRAM_ID } from "@spookpad/core/fee-check";
import { sendRaw, type Expiry } from "./pending";

export function feeTransaction(p: { from: string; treasury: string; lamports: number; memo: string }): Transaction {
  const from = new PublicKey(p.from);
  return new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(p.treasury), lamports: p.lamports }),
    new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [{ pubkey: from, isSigner: true, isWritable: false }],
      data: Buffer.from(p.memo, "utf8"),
    }),
  );
}

export interface SignedFee {
  signature: string; // known before anything is sent, so it can be remembered first
  expiry: Expiry;
  send(): Promise<void>;
}

// The wallet signs the fee; the page then sends it itself, so the signature (and the blockhash it was built on) is
// known before the transaction can reach Solana.
export async function signFee(
  d: { connection: Pick<Connection, "getLatestBlockhash" | "sendRawTransaction">; signTransaction(tx: Transaction): Promise<Transaction> },
  p: { from: string; treasury: string; lamports: number; memo: string },
): Promise<SignedFee> {
  const { blockhash } = await d.connection.getLatestBlockhash("confirmed");
  const tx = feeTransaction(p);
  tx.feePayer = new PublicKey(p.from);
  tx.recentBlockhash = blockhash;
  const signed = await d.signTransaction(tx);
  const first = signed.signatures[0]?.signature;
  if (!first) throw new Error("Your wallet didn't sign the payment, so nothing was sent.");
  return {
    signature: bs58.encode(first),
    expiry: { blockhash: signed.recentBlockhash ?? blockhash }, // what the wallet actually signed
    send: async () => { await sendRaw(d.connection, signed.serialize()); }, // throws NotSent when the node refused it
  };
}
