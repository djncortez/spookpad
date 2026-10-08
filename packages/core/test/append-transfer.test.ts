import { describe, expect, test } from "vitest";
import {
  AddressLookupTableAccount, Keypair, SystemInstruction, SystemProgram, Transaction, TransactionInstruction, TransactionMessage,
  VersionedTransaction, type PublicKey,
} from "@solana/web3.js";
import { appendInstructions, appendTransfer, MAX_TX_BYTES } from "../src/append-transfer";
import { decodeTransaction, loadedAddresses, SYSTEM_PROGRAM, tableAddresses, type LookupTables } from "../src/solana-tx";

const payer = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const treasury = Keypair.generate().publicKey;
const program = Keypair.generate().publicKey;
const writable = Keypair.generate().publicKey;
const readonly = Keypair.generate().publicKey;
const l1 = Keypair.generate().publicKey;
const l2 = Keypair.generate().publicKey;
const l3 = Keypair.generate().publicKey;
const BLOCKHASH = "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK";
const table = (addresses: PublicKey[]) => new AddressLookupTableAccount({
  key: Keypair.generate().publicKey,
  state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses },
});
const alt = table([l1, l2]);
// like PumpPortal's table: it also holds the System Program, and an address the transaction doesn't use yet
const sysAlt = table([l1, SystemProgram.programId, l2, l3]);
const tablesOf = (...alts: AddressLookupTableAccount[]): LookupTables =>
  Object.fromEntries(alts.map((a) => [a.key.toBase58(), a.state.addresses.map((k) => k.toBase58())]));
const TABLES = tablesOf(alt);
const SYS_TABLES = tablesOf(sysAlt);

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
// like pump.fun create_v2: passes the System Program as a plain read-only account, so a table can load it
const createLike = new TransactionInstruction({
  programId: program,
  keys: [...pumpLike.keys, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
  data: Buffer.from([4, 5, 6]),
});

function v0(instructions: TransactionInstruction[], lookup = alt) {
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: BLOCKHASH, instructions }).compileToV0Message([lookup]);
  return new VersionedTransaction(msg).serialize();
}
const decompile = (bytes: Uint8Array, lookup = alt) =>
  TransactionMessage.decompile(VersionedTransaction.deserialize(bytes).message, { addressLookupTableAccounts: [lookup] });
const keysOf = (ix: TransactionInstruction) => ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);
const accountsOf = (bytes: Uint8Array, tables: LookupTables) => {
  const tx = decodeTransaction(bytes);
  return [...tx.staticKeys, ...loadedAddresses(tx, tables)];
};
const expectNoDuplicates = (bytes: Uint8Array, tables: LookupTables) => {
  const all = accountsOf(bytes, tables);
  expect(new Set(all).size).toBe(all.length);
};

describe("appendTransfer", () => {
  test("adds the fee transfer to a v0 transaction with lookup tables, leaving the rest unchanged", () => {
    const before = v0([pumpLike]);
    const out = appendTransfer(decodeTransaction(before), TABLES, treasury.toBase58(), 20_000_000n);
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
    expect(decodeTransaction(out).lookupSection).toEqual(decodeTransaction(before).lookupSection);
    expectNoDuplicates(out, TABLES);
  });

  test("reuses the system program when the transaction already calls it", () => {
    const before = v0([SystemProgram.transfer({ fromPubkey: payer, toPubkey: writable, lamports: 5 }), pumpLike]);
    const now = decompile(appendTransfer(decodeTransaction(before), TABLES, treasury.toBase58(), 7n));
    expect(now.instructions).toHaveLength(3);
    expect(SystemInstruction.decodeTransfer(now.instructions[0]).toPubkey.toBase58()).toBe(writable.toBase58());
    expect(SystemInstruction.decodeTransfer(now.instructions[2]).toPubkey.toBase58()).toBe(treasury.toBase58());
    expect(keysOf(now.instructions[1])).toEqual(keysOf(decompile(before).instructions[1]));
  });

  test("moves the System Program out of a lookup table instead of listing it twice", () => {
    const before = v0([createLike], sysAlt);
    expect(decodeTransaction(before).staticKeys).not.toContain(SYSTEM_PROGRAM); // loaded from the table, read-only
    expect(accountsOf(before, SYS_TABLES)).toContain(SYSTEM_PROGRAM);
    const out = appendTransfer(decodeTransaction(before), SYS_TABLES, treasury.toBase58(), 20_000_000n);
    expectNoDuplicates(out, SYS_TABLES);
    const tx = decodeTransaction(out);
    expect(tx.staticKeys).toContain(SYSTEM_PROGRAM); // a called program must be a static key
    expect(loadedAddresses(tx, SYS_TABLES)).not.toContain(SYSTEM_PROGRAM);
    const now = decompile(out, sysAlt);
    expect(keysOf(now.instructions[0])).toEqual(keysOf(decompile(before, sysAlt).instructions[0]));
    const t = SystemInstruction.decodeTransfer(now.instructions[1]);
    expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), BigInt(t.lamports)]).toEqual([payer.toBase58(), treasury.toBase58(), 20_000_000n]);
  });

  test("works on a legacy transaction", () => {
    const legacy = new Transaction({ feePayer: payer, recentBlockhash: BLOCKHASH }).add(pumpLike);
    const bytes = legacy.serialize({ requireAllSignatures: false, verifySignatures: false });
    const out = appendTransfer(decodeTransaction(new Uint8Array(bytes)), {}, treasury.toBase58(), 9n);
    const back = Transaction.from(out);
    expect(back.instructions).toHaveLength(2);
    expect(back.instructions[0].programId.toBase58()).toBe(program.toBase58());
    expect(keysOf(back.instructions[0])).toEqual(keysOf(pumpLike));
    expect(Buffer.from(back.instructions[0].data)).toEqual(Buffer.from([1, 2, 3]));
    const t = SystemInstruction.decodeTransfer(back.instructions[1]);
    expect([t.fromPubkey.toBase58(), t.toPubkey.toBase58(), BigInt(t.lamports)]).toEqual([payer.toBase58(), treasury.toBase58(), 9n]);
  });

  test("an already writable recipient is reused; a read-only one is refused, static or from a table", () => {
    const now = decompile(appendTransfer(decodeTransaction(v0([pumpLike])), TABLES, writable.toBase58(), 1n));
    expect(SystemInstruction.decodeTransfer(now.instructions[1]).toPubkey.toBase58()).toBe(writable.toBase58());
    const viaTable = appendTransfer(decodeTransaction(v0([pumpLike])), TABLES, l1.toBase58(), 1n); // l1 is loaded writable
    expect(SystemInstruction.decodeTransfer(decompile(viaTable).instructions[1]).toPubkey.toBase58()).toBe(l1.toBase58());
    expectNoDuplicates(viaTable, TABLES);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), TABLES, readonly.toBase58(), 1n)).toThrow(/read-only/);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), TABLES, l2.toBase58(), 1n)).toThrow(/read-only/); // loaded read-only
  });

  test("refuses signed transactions, zero amounts, paying the payer and unread tables", () => {
    const signed = decodeTransaction(v0([pumpLike]));
    signed.signatures[0] = new Uint8Array(64).fill(1);
    expect(() => appendTransfer(signed, TABLES, treasury.toBase58(), 1n)).toThrow(/already signed/);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), TABLES, treasury.toBase58(), 0n)).toThrow(/positive/);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), TABLES, payer.toBase58(), 1n)).toThrow(/fee payer/);
    expect(() => appendTransfer(decodeTransaction(v0([pumpLike])), {}, treasury.toBase58(), 1n)).toThrow(/wasn't read/);
  });

  test("refuses a recipient that is not a 32-byte address and amounts of 2^64 or more", () => {
    const tx = () => decodeTransaction(v0([pumpLike]));
    expect(() => appendTransfer(tx(), TABLES, "abc", 1n)).toThrow(/32-byte/);
    expect(() => appendTransfer(tx(), TABLES, "0OIl", 1n)).toThrow(/32-byte/);
    expect(() => appendTransfer(tx(), TABLES, treasury.toBase58(), 2n ** 64n)).toThrow(/positive/);
    expect(appendTransfer(tx(), TABLES, treasury.toBase58(), 2n ** 64n - 1n).length).toBeGreaterThan(0);
  });

  test("refuses to grow past the Solana size limit", () => {
    const big = new TransactionInstruction({ programId: program, keys: [], data: Buffer.alloc(1050) });
    expect(() => appendTransfer(decodeTransaction(v0([big])), TABLES, treasury.toBase58(), 1n)).toThrow(/too large/);
    expect(MAX_TX_BYTES).toBe(1232);
  });
});

describe("appendInstructions", () => {
  const ix = (programId: PublicKey, keys: [PublicKey, boolean, boolean][]) => ({
    programId: programId.toBase58(),
    accounts: keys.map(([k, signer, w]) => ({ pubkey: k.toBase58(), signer, writable: w })),
    data: new Uint8Array([7]),
  });

  test("loads a new account from a table the transaction already uses, and adds the rest as static keys", () => {
    const before = v0([createLike], sysAlt);
    const other = Keypair.generate().publicKey;
    const out = appendInstructions(decodeTransaction(before), SYS_TABLES, [ix(program, [[payer, true, true], [l3, false, true], [other, false, false]])]);
    expectNoDuplicates(out, SYS_TABLES);
    const tx = decodeTransaction(out);
    expect(tx.staticKeys).not.toContain(l3.toBase58()); // 1 byte from the table instead of 32
    expect(tx.staticKeys).toContain(other.toBase58());
    const now = decompile(out, sysAlt);
    expect(keysOf(now.instructions[1])).toEqual([[payer.toBase58(), true, true], [l3.toBase58(), false, true], [other.toBase58(), false, false]]);
    expect(keysOf(now.instructions[0])).toEqual(keysOf(decompile(before, sysAlt).instructions[0]));
  });

  test("refuses new signers", () => {
    const stranger = Keypair.generate().publicKey;
    expect(() => appendInstructions(decodeTransaction(v0([pumpLike])), TABLES, [ix(program, [[stranger, true, false]])])).toThrow(/sign/);
  });

  test("refuses a transaction that already lists an account twice", () => {
    const before = decodeTransaction(v0([pumpLike]));
    const twice: LookupTables = { [alt.key.toBase58()]: [writable.toBase58(), l2.toBase58()] }; // the table's l1 slot "is" writable
    expect(() => appendInstructions(before, twice, [])).toThrow(/twice/);
  });
});

describe("tableAddresses", () => {
  const account = (deactivation: bigint, addresses: PublicKey[]) => {
    const data = new Uint8Array(56 + 32 * addresses.length);
    const view = new DataView(data.buffer);
    view.setUint32(0, 1, true); // ProgramState::LookupTable
    view.setBigUint64(4, deactivation, true);
    addresses.forEach((a, i) => data.set(a.toBytes(), 56 + 32 * i));
    return data;
  };
  test("reads the addresses after the 56-byte header", () => {
    expect(tableAddresses(account(2n ** 64n - 1n, [l1, l2]))).toEqual([l1.toBase58(), l2.toBase58()]);
  });
  test("refuses a table being closed and accounts that aren't tables", () => {
    expect(() => tableAddresses(account(5n, [l1]))).toThrow(/closed/);
    expect(() => tableAddresses(new Uint8Array(57))).toThrow(/lookup table/);
  });
});
