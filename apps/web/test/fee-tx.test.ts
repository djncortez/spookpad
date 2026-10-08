import { expect, test } from "vitest";
import { Keypair, SystemInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "@spookpad/core/fee-check";
import { feeTransaction } from "../lib/fee-tx";

test("one transfer to the treasury plus the generation's memo", () => {
  const from = Keypair.generate().publicKey.toBase58();
  const treasury = Keypair.generate().publicKey.toBase58();
  const tx = feeTransaction({ from, treasury, lamports: 1_000_000, memo: "spookpad:abc" });
  const t = SystemInstruction.decodeTransfer(tx.instructions[0]);
  expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), Number(t.lamports)]).toEqual([from, treasury, 1_000_000]);
  expect(tx.instructions[1].programId.toBase58()).toBe(MEMO_PROGRAM_ID);
  expect(Buffer.from(tx.instructions[1].data).toString("utf8")).toBe("spookpad:abc");
});
