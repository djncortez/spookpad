// Just enough of the Solana transaction wire format for SpookPad, with no Solana SDK: read a transaction
// (legacy or v0), sign it, and build the one transfer SpookPad sends itself (funding a coin wallet).
// Layout: compact-u16 signature count, 64-byte signatures, then the message: [0x80 | version] (v0 only),
// header (3 bytes), compact-u16 account count + 32-byte keys, 32-byte recent blockhash, compact-u16 instruction
// count + instructions (program index u8, compact-u16 + account indexes u8, compact-u16 + data), and for v0
// compact-u16 address-table lookups.
import bs58 from "bs58";
import { signBytes, type Keypair } from "./keys";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export interface TxInstruction {
  programIndex: number;
  accounts: number[];
  data: Uint8Array;
}

export interface DecodedTx {
  signatures: Uint8Array[];
  version: "legacy" | 0;
  header: { requiredSignatures: number; readonlySigned: number; readonlyUnsigned: number };
  staticKeys: string[];
  recentBlockhash: string;
  instructions: TxInstruction[];
  lookupTables: number;
  lookupSection: Uint8Array; // v0 only: the raw address-table-lookup bytes (count included), kept as they are
  message: Uint8Array; // the exact bytes that are signed
}

class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.b.length) throw new Error("Transaction is cut short.");
    return this.b[this.pos++];
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.b.length) throw new Error("Transaction is cut short.");
    const out = this.b.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  compact(): number {
    let value = 0;
    for (let shift = 0; shift < 21; shift += 7) {
      const byte = this.u8();
      value |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) return value;
    }
    throw new Error("Bad length in transaction.");
  }
}

function compact(n: number): number[] {
  const out: number[] = [];
  for (;;) {
    const byte = n & 0x7f;
    n >>>= 7;
    if (n === 0) { out.push(byte); return out; }
    out.push(byte | 0x80);
  }
}

export function decodeTransaction(bytes: Uint8Array): DecodedTx {
  const r = new Reader(bytes);
  const signatures = Array.from({ length: r.compact() }, () => r.bytes(64));
  const start = r.pos;
  let version: "legacy" | 0 = "legacy";
  let first = r.u8();
  if (first & 0x80) {
    if ((first & 0x7f) !== 0) throw new Error("Unsupported transaction version.");
    version = 0;
    first = r.u8();
  }
  const header = { requiredSignatures: first, readonlySigned: r.u8(), readonlyUnsigned: r.u8() };
  const staticKeys = Array.from({ length: r.compact() }, () => bs58.encode(r.bytes(32)));
  const recentBlockhash = bs58.encode(r.bytes(32));
  const instructions = Array.from({ length: r.compact() }, () => {
    const programIndex = r.u8();
    const accounts = Array.from(r.bytes(r.compact()));
    return { programIndex, accounts, data: r.bytes(r.compact()) };
  });
  let lookupTables = 0;
  let lookupSection = new Uint8Array(0);
  if (version === 0) {
    const at = r.pos;
    lookupTables = r.compact();
    for (let i = 0; i < lookupTables; i++) {
      r.bytes(32);
      r.bytes(r.compact());
      r.bytes(r.compact());
    }
    lookupSection = bytes.slice(at, r.pos);
  }
  if (r.pos !== bytes.length) throw new Error("Unexpected bytes after the transaction.");
  if (signatures.length !== header.requiredSignatures) throw new Error("Signature count doesn't match the message.");
  for (const ix of instructions) {
    if (ix.programIndex >= staticKeys.length) throw new Error("Program account isn't in the transaction.");
  }
  return { signatures, version, header, staticKeys, recentBlockhash, instructions, lookupTables, lookupSection, message: bytes.slice(start) };
}

export const programOf = (tx: DecodedTx, ix: TxInstruction): string => tx.staticKeys[ix.programIndex];
// the account at an instruction's position, or null when it comes from an address-lookup table
export const accountOf = (tx: DecodedTx, ix: TxInstruction, position: number): string | null => {
  const index = ix.accounts[position];
  return index !== undefined && index < tx.staticKeys.length ? tx.staticKeys[index] : null;
};

// Fills in the signatures of the given signers; refuses a signer the transaction doesn't ask for.
export function signTransaction(tx: DecodedTx, signers: Keypair[]): Uint8Array {
  const signatures: Uint8Array[] = tx.signatures.map((s) => new Uint8Array(s));
  for (const kp of signers) {
    const slot = tx.staticKeys.slice(0, tx.header.requiredSignatures).indexOf(kp.publicKey);
    if (slot < 0) throw new Error(`${kp.publicKey} isn't a signer of this transaction.`);
    signatures[slot] = signBytes(kp, tx.message);
  }
  return serialize(signatures, tx.message);
}

export function serialize(signatures: Uint8Array[], message: Uint8Array): Uint8Array {
  const head = compact(signatures.length);
  const out = new Uint8Array(head.length + 64 * signatures.length + message.length);
  out.set(head, 0);
  signatures.forEach((s, i) => out.set(s, head.length + 64 * i));
  out.set(message, head.length + 64 * signatures.length);
  return out;
}

export const txSignature = (signed: Uint8Array): string => bs58.encode(decodeTransaction(signed).signatures[0]);

// A legacy message: `from` pays and signs, system transfer of `lamports` to `to`.
export function transferMessage(from: string, to: string, lamports: bigint, recentBlockhash: string): Uint8Array {
  if (from === to) throw new Error("Can't transfer to the same account.");
  if (lamports <= 0n) throw new Error("Transfer amount must be positive.");
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true); // SystemInstruction::Transfer
  view.setBigUint64(4, lamports, true);
  const parts: number[] = [
    1, 0, 1, // header: 1 signer, 0 readonly signed, 1 readonly unsigned (the system program)
    ...compact(3), ...bs58.decode(from), ...bs58.decode(to), ...bs58.decode(SYSTEM_PROGRAM),
    ...bs58.decode(recentBlockhash),
    ...compact(1), 2, ...compact(2), 0, 1, ...compact(data.length), ...data,
  ];
  return new Uint8Array(parts);
}

export function signedTransfer(from: Keypair, to: string, lamports: bigint, recentBlockhash: string): Uint8Array {
  const message = transferMessage(from.publicKey, to, lamports, recentBlockhash);
  return serialize([signBytes(from, message)], message);
}

export { compact as compactU16 };

// Encodes a message (legacy or v0 without lookup tables). Used for tests' fixtures and simple transactions.
export function encodeMessage(m: {
  version: "legacy" | 0;
  header: DecodedTx["header"];
  staticKeys: string[];
  recentBlockhash: string;
  instructions: TxInstruction[];
}): Uint8Array {
  const parts: number[] = [];
  if (m.version === 0) parts.push(0x80);
  parts.push(m.header.requiredSignatures, m.header.readonlySigned, m.header.readonlyUnsigned);
  parts.push(...compact(m.staticKeys.length));
  for (const k of m.staticKeys) parts.push(...bs58.decode(k));
  parts.push(...bs58.decode(m.recentBlockhash));
  parts.push(...compact(m.instructions.length));
  for (const ix of m.instructions) {
    parts.push(ix.programIndex, ...compact(ix.accounts.length), ...ix.accounts, ...compact(ix.data.length), ...ix.data);
  }
  if (m.version === 0) parts.push(...compact(0));
  return new Uint8Array(parts);
}

// A legacy message: `from` pays and signs, one system transfer per recipient (a payout batch). Recipients must
// differ from `from` and from each other.
export function multiTransferMessage(from: string, transfers: { to: string; lamports: bigint }[], recentBlockhash: string): Uint8Array {
  if (!transfers.length) throw new Error("No transfers.");
  const recipients = transfers.map((t) => t.to);
  if (new Set(recipients).size !== recipients.length || recipients.includes(from)) throw new Error("Each recipient once, never the payer.");
  if (transfers.some((t) => t.lamports <= 0n)) throw new Error("Transfer amounts must be positive.");
  const keys = [from, ...recipients, SYSTEM_PROGRAM];
  const system = keys.length - 1;
  return encodeMessage({
    version: "legacy",
    header: { requiredSignatures: 1, readonlySigned: 0, readonlyUnsigned: 1 },
    staticKeys: keys,
    recentBlockhash,
    instructions: transfers.map((t, i) => {
      const data = new Uint8Array(12);
      const view = new DataView(data.buffer);
      view.setUint32(0, 2, true);
      view.setBigUint64(4, t.lamports, true);
      return { programIndex: system, accounts: [0, i + 1], data };
    }),
  });
}

export function signedMultiTransfer(from: Keypair, transfers: { to: string; lamports: bigint }[], recentBlockhash: string): Uint8Array {
  const message = multiTransferMessage(from.publicKey, transfers, recentBlockhash);
  return serialize([signBytes(from, message)], message);
}
