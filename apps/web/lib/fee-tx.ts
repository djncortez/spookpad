// The costume fee: one SOL transfer to the treasury plus a memo naming the generation, signed by the trader's wallet
// (spec §2 step 4). The costume function checks exactly these instructions.
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { MEMO_PROGRAM_ID } from "@spookpad/core/fee-check";

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
