import { expect, test } from "vitest";
import { Keypair, SystemInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "@spookpad/core/fee-check";
import bs58 from "bs58";
import { feeTransaction, signFee } from "../lib/fee-tx";

test("one transfer to the treasury plus the generation's memo", () => {
  const from = Keypair.generate().publicKey.toBase58();
  const treasury = Keypair.generate().publicKey.toBase58();
  const tx = feeTransaction({ from, treasury, lamports: 1_000_000, memo: "spookpad:abc" });
  const t = SystemInstruction.decodeTransfer(tx.instructions[0]);
  expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), Number(t.lamports)]).toEqual([from, treasury, 1_000_000]);
  expect(tx.instructions[1].programId.toBase58()).toBe(MEMO_PROGRAM_ID);
  expect(Buffer.from(tx.instructions[1].data).toString("utf8")).toBe("spookpad:abc");
});

test("signFee knows the signature and blockhash before anything is sent", async () => {
  const payer = Keypair.generate();
  const treasury = Keypair.generate().publicKey.toBase58();
  const order: string[] = [];
  const BH = "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK";
  const connection = {
    getLatestBlockhash: async () => ({ blockhash: BH, lastValidBlockHeight: 123 }),
    sendRawTransaction: async () => { order.push("send"); return "x"; },
  };
  const fee = await signFee({ connection, signTransaction: async (tx) => { order.push("sign"); tx.partialSign(payer); return tx; } },
    { from: payer.publicKey.toBase58(), treasury, lamports: 1_000_000, memo: "spookpad:abc" });
  expect(order).toEqual(["sign"]); // signed, not yet sent
  expect(fee.expiry).toEqual({ blockhash: BH });
  expect(bs58.decode(fee.signature)).toHaveLength(64);
  await fee.send();
  expect(order).toEqual(["sign", "send"]);
});

test("signFee remembers the blockhash the wallet actually signed, if it changed it", async () => {
  const payer = Keypair.generate();
  const treasury = Keypair.generate().publicKey.toBase58();
  const BH = "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK";
  const OTHER = "GfnhkAa2iy8cZV7X5SyyYmDtxnCtHKQrMiBhEsMEHv2n";
  const connection = { getLatestBlockhash: async () => ({ blockhash: BH, lastValidBlockHeight: 1 }), sendRawTransaction: async () => "x" };
  const fee = await signFee({ connection, signTransaction: async (tx) => { tx.recentBlockhash = OTHER; tx.partialSign(payer); return tx; } },
    { from: payer.publicKey.toBase58(), treasury, lamports: 1, memo: "m" });
  expect(fee.expiry).toEqual({ blockhash: OTHER });
});
