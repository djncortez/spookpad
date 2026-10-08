import { describe, expect, test } from "vitest";
import {
  AddressLookupTableAccount, Keypair, SystemInstruction, SystemProgram, Transaction, TransactionInstruction, TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { appendTransfer, MAX_TX_BYTES } from "../src/append-transfer";
import { decodeTransaction } from "../src/solana-tx";

const payer = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const treasury = Keypair.generate().publicKey;
const program = Keypair.generate().publicKey;
const writable = Keypair.generate().publicKey;
const readonly = Keypair.generate().publicKey;
const l1 = Keypair.generate().publicKey;
const l2 = Keypair.generate().publicKey;
const BLOCKHASH = "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK";
const alt = new AddressLookupTableAccount({
  key: Keypair.generate().publicKey,
  state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: [l1, l2] },
});

const pumpLike = new TransactionInstruction({
  programId: program,
  keys: [
    { pubkey: mint, isSigner: true, isWritable: true },
    { pubkey: writable, isSigner: false, isWritable: true },
    { pubkey: readonly, isSigner: false, isWritable: false },
    { pubkey: l1, isSigner: false, isWritable: true },
    { pubkey: l2, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([1, 2, 3]),
});

function v0(instructions: TransactionInstruction[]) {
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: BLOCKHASH, instructions }).compileToV0Message([alt]);
  return new VersionedTransaction(msg).serialize();
}
const decompile = (bytes: Uint8Array) =>
  TransactionMessage.decompile(VersionedTransaction.deserialize(bytes).message, { addressLookupTableAccounts: [alt] });
const keysOf = (ix: TransactionInstruction) => ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);

describe("appendTransfer", () => {
  test("adds the fee transfer to a v0 transaction with lookup tables, leaving the rest unchanged", () => {
    const before = v0([pumpLike]);
    const out = appendTransfer(decodeTransaction(before), treasury.toBase58(), 20_000_000n);
    const was = decompile(before);
    const now = decompile(out);
    expect(now.recentBlockhash).toBe(BLOCKHASH);
    expect(now.payerKey.toBase58()).toBe(payer.toBase58());
    expect(now.instructions).toHaveLength(2);
    expect(keysOf(now.instructions[0])).toEqual(keysOf(was.instructions[0]));
    expect(now.instructions[0].programId.toBase58()).toBe(program.toBase58());
    const t = SystemInstruction.decodeTransfer(now.instructions[1]);
    expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), BigInt(t.lamports)]).toEqual([payer.toBase58(), treasury.toBase58(), 20_000_000n]);
    const tx = VersionedTransaction.deserialize(out);
    expect(tx.signatures).toHaveLength(2); // payer + mint, still unsigned
    expect(tx.signatures.every((s) => s.every((b) => b === 0))).toBe(true);
  });

  test("reuses the system program when the transaction already calls it", () => {
    const before = v0([SystemProgram.transfer({ fromPubkey: payer, toPubkey: writable, lamports: 5 }), pumpLike]);
    const now = decompile(appendTransfer(decodeTransaction(before), treasury.toBase58(), 7n));
    expect(now.instructions).toHaveLength(3);
    expect(SystemInstruction.decodeTransfer(now.instructions[0]).toPubkey.toBase58()).toBe(writable.toBase58());
    expect(SystemInstruction.decodeTransfer(now.instructions[2]).toPubkey.toBase58()).toBe(treasury.toBase58());
    expect(keysOf(now.instructions[1])).toEqual(keysOf(decompile(before).instructions[1]));
  });

  test("works on a legacy transaction", () => {
    const legacy = new Transaction({ feePayer: payer, recentBlockhash: BLOCKHASH }).add(pumpLike);
    const bytes = legacy.serialize({ requireAllSignatures: false, verifySignatures: false });
    const out = appendTransfer(decodeTransaction(new Uint8Array(bytes)), treasury.toBase58(), 9n);
    const back = Transaction.from(out);
    expect(back.instructions).toHaveLength(2);
    expect(back.instructions[0].programId.toBase58()).toBe(program.toBase58());
    expect(keysOf(back.instructions[0])).toEqual(keysOf(pumpLike));
    expect(Buffer.from(back.instructions[0].data)).toEqual(Buffer.from([1, 2, 3]));
    const t = SystemInstruction.decodeTransfer(back.instructions[1]);
    expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), BigInt(t.lamports)]).toEqual([payer.toBase58(), treasury.toBase58(), 9n]);
  });

  test("an already writable recipient is reused; a read-only one is refused", () => {
    const now = decompile(appendTransfer(decodeTransaction(v0([pumpLike])), writable.toBase58(), 1n));
    expect(SystemInstruction.decodeTransfer(now.instructions[1]).toPubkey.toBase58()).toBe(writable.toBase58());
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), readonly.toBase58(), 1n)).toThrow(/read-only/);
  });

  test("refuses signed transactions, zero amounts and paying the payer", () => {
    const signed = decodeTransaction(v0([pumpLike]));
    signed.signatures[0] = new Uint8Array(64).fill(1);
    expect(() => appendTransfer(signed, treasury.toBase58(), 1n)).toThrow(/already signed/);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), treasury.toBase58(), 0n)).toThrow(/positive/);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), payer.toBase58(), 1n)).toThrow(/fee payer/);
  });

  test("refuses a recipient that is not a 32-byte address and amounts of 2^64 or more", () => {
    const tx = () => decodeTransaction(v0([pumpLike]));
    expect(() => appendTransfer(tx(), "abc", 1n)).toThrow(/32-byte/);
    expect(() => appendTransfer(tx(), "0OIl", 1n)).toThrow(/32-byte/);
    expect(() => appendTransfer(tx(), treasury.toBase58(), 2n ** 64n)).toThrow(/positive/);
    expect(appendTransfer(tx(), treasury.toBase58(), 2n ** 64n - 1n).length).toBeGreaterThan(0);
  });

  test("refuses to grow past the Solana size limit", () => {
    const big = new TransactionInstruction({ programId: program, keys: [], data: Buffer.alloc(1050) });
    expect(() => appendTransfer(decodeTransaction(v0([big])), treasury.toBase58(), 1n)).toThrow(/too large/);
    expect(MAX_TX_BYTES).toBe(1232);
  });
});
