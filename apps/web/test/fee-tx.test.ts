import { expect, test, vi } from "vitest";
import { ComputeBudgetInstruction, Keypair, SendTransactionError, SystemInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "@spookpad/core/fee-check";
import bs58 from "bs58";
import { FEE_COMPUTE_UNITS, FEE_PRICE_MICROLAMPORTS, feeTransaction, signFee } from "../lib/fee-tx";
import { NotSent, REBROADCAST_MS, REBROADCAST_TIMES, sendRaw } from "../lib/pending";

test("a priority fee, one transfer to the treasury, plus the generation's memo", () => {
  const from = Keypair.generate().publicKey.toBase58();
  const treasury = Keypair.generate().publicKey.toBase58();
  const tx = feeTransaction({ from, treasury, lamports: 1_000_000, memo: "spookpad:abc" });
  expect(tx.instructions).toHaveLength(4);
  expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(tx.instructions[0]).units).toBe(FEE_COMPUTE_UNITS);
  expect(Number(ComputeBudgetInstruction.decodeSetComputeUnitPrice(tx.instructions[1]).microLamports)).toBe(FEE_PRICE_MICROLAMPORTS);
  // the most the priority fee can cost: 0.00002 SOL
  expect((FEE_COMPUTE_UNITS * FEE_PRICE_MICROLAMPORTS) / 1e6).toBeLessThanOrEqual(20_000);
  const t = SystemInstruction.decodeTransfer(tx.instructions[2]);
  expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), Number(t.lamports)]).toEqual([from, treasury, 1_000_000]);
  expect(tx.instructions[3].programId.toBase58()).toBe(MEMO_PROGRAM_ID);
  expect(Buffer.from(tx.instructions[3].data).toString("utf8")).toBe("spookpad:abc");
});

test("sendRaw re-sends the same bytes until the rebroadcast window ends", async () => {
  vi.useFakeTimers();
  try {
    const sent: { skipPreflight?: boolean }[] = [];
    const raw = new Uint8Array([1, 2, 3]);
    const connection = { sendRawTransaction: async (b: Uint8Array, o?: { skipPreflight?: boolean }) => { expect(b).toBe(raw); sent.push(o ?? {}); return "sig"; } };
    expect(await sendRaw(connection, raw)).toBe("sig");
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(REBROADCAST_MS * (REBROADCAST_TIMES + 5));
    expect(sent).toHaveLength(1 + REBROADCAST_TIMES);
    expect(sent.slice(1).every((o) => o.skipPreflight === true)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test("sendRaw doesn't re-send when the first send was refused", async () => {
  vi.useFakeTimers();
  try {
    let calls = 0;
    const refused = new SendTransactionError({ action: "simulate", signature: "", transactionMessage: "insufficient funds" });
    await sendRaw({ sendRawTransaction: async () => { calls++; throw refused; } }, new Uint8Array(1)).catch(() => {});
    await vi.advanceTimersByTimeAsync(REBROADCAST_MS * 5);
    expect(calls).toBe(1);
  } finally {
    vi.useRealTimers();
  }
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

test("a transaction the RPC node refused (preflight) becomes NotSent with the node's reason", async () => {
  const refused = new SendTransactionError({ action: "simulate", signature: "", transactionMessage: "Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.", logs: [] });
  const err = await sendRaw({ sendRawTransaction: async () => { throw refused; } }, new Uint8Array(1)).catch((e) => e);
  expect(err).toBeInstanceOf(NotSent);
  expect(err.message).toBe("Solana refused the transaction (Transaction simulation failed: Attempt to debit an account but found no record of a prior credit), so nothing was sent. You can try again.");
});

test("a network failure is not NotSent: the transaction may have gone out", async () => {
  const err = await sendRaw({ sendRawTransaction: async () => { throw new TypeError("fetch failed"); } }, new Uint8Array(1)).catch((e) => e);
  expect(err).not.toBeInstanceOf(NotSent);
  expect(err.message).toBe("fetch failed");
});

test("signFee's send reports a refused fee as NotSent", async () => {
  const payer = Keypair.generate();
  const connection = {
    getLatestBlockhash: async () => ({ blockhash: "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK", lastValidBlockHeight: 1 }),
    sendRawTransaction: async () => { throw new SendTransactionError({ action: "simulate", signature: "", transactionMessage: "insufficient funds" }); },
  };
  const fee = await signFee({ connection, signTransaction: async (tx) => { tx.partialSign(payer); return tx; } },
    { from: payer.publicKey.toBase58(), treasury: Keypair.generate().publicKey.toBase58(), lamports: 1, memo: "m" });
  await expect(fee.send()).rejects.toBeInstanceOf(NotSent);
});
