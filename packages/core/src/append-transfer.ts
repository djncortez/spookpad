// Adds SpookPad's own instructions (the dev buy, then the launch-fee transfer) to the unsigned create transaction
// PumpPortal built, keeping its blockhash and address-lookup tables (spec §4.2 step 5). The message is rebuilt from
// account addresses. Static keys keep their order [writable signers][read-only signers][writable non-signers]
// [read-only non-signers] and new ones go at the end of their group; accounts loaded from lookup tables are numbered
// after the static keys (every table's writable picks, then every table's read-only picks). Solana refuses a
// transaction that lists an account twice (AccountLoadedTwice), so for each account an added instruction uses:
// - already a static key, or already loaded from a table, with the rights it needs: it is reused;
// - loaded read-only from a table but needed writable, or needed as a signer it isn't: refused;
// - a program being called must be a static key (Solana never loads programs from tables): when a table loads it,
//   it moves out of the table into the static keys;
// - a new account one of the transaction's tables holds is loaded from that table (1 byte instead of 32);
// - otherwise it becomes a new static key. New signers are never added.
import bs58 from "bs58";
import { compactU16, serialize, SYSTEM_PROGRAM, type DecodedTx, type LookupTables } from "./solana-tx";

export const MAX_TX_BYTES = 1232;

export interface AccountMeta {
  pubkey: string;
  signer: boolean;
  writable: boolean;
}

export interface NewInstruction {
  programId: string;
  accounts: AccountMeta[];
  data: Uint8Array;
}

type Place =
  | { kind: "static"; signer: boolean; writable: boolean; added: boolean }
  | { kind: "table"; table: number; index: number; writable: boolean };

export function appendInstructions(tx: DecodedTx, tables: LookupTables, added: NewInstruction[]): Uint8Array {
  if (tx.signatures.some((s) => s.some((b) => b !== 0))) throw new Error("The transaction is already signed.");
  const { requiredSignatures: sigs, readonlySigned, readonlyUnsigned } = tx.header;
  const n = tx.staticKeys.length;
  const lookups = tx.lookups.map((l) => ({ table: l.table, writable: [...l.writable], readonly: [...l.readonly] }));
  const contents = lookups.map((l) => {
    const list = tables[l.table];
    if (!list || [...l.writable, ...l.readonly].some((i) => i >= list.length)) {
      throw new Error(`Lookup table ${l.table} wasn't read, or is shorter than the transaction expects.`);
    }
    return list;
  });

  // the transaction as it is, by address
  const place = new Map<string, Place>();
  tx.staticKeys.forEach((k, i) => place.set(k, {
    kind: "static", signer: i < sigs, writable: i < sigs - readonlySigned || (i >= sigs && i < n - readonlyUnsigned), added: false,
  }));
  const loaded: string[] = [];
  for (const kind of ["writable", "readonly"] as const) {
    lookups.forEach((l, t) => l[kind].forEach((index) => {
      const address = contents[t][index];
      loaded.push(address);
      place.set(address, { kind: "table", table: t, index, writable: kind === "writable" });
    }));
  }
  const all = [...tx.staticKeys, ...loaded];
  if (new Set(all).size !== all.length) throw new Error("The transaction lists an account twice.");
  const at = (i: number) => {
    if (i >= all.length) throw new Error("The transaction uses an account it doesn't list.");
    return all[i];
  };
  const instructions = tx.instructions.map((ix) => ({ program: at(ix.programIndex), accounts: ix.accounts.map(at), data: ix.data }));

  // what the added instructions need from each account
  const need = new Map<string, { signer: boolean; writable: boolean; program: boolean }>();
  const want = (key: string, signer: boolean, writable: boolean, program: boolean) => {
    const was = need.get(key) ?? { signer: false, writable: false, program: false };
    need.set(key, { signer: was.signer || signer, writable: was.writable || writable, program: was.program || program });
  };
  for (const ix of added) {
    want(ix.programId, false, false, true);
    for (const a of ix.accounts) want(a.pubkey, a.signer, a.writable, false);
  }
  const fresh: string[] = []; // new static keys, in order of first use
  for (const [key, req] of need) {
    let bytes: Uint8Array;
    try { bytes = bs58.decode(key); } catch { bytes = new Uint8Array(0); }
    if (bytes.length !== 32) throw new Error(`${key} isn't a 32-byte base58 address.`);
    const p = place.get(key);
    if (req.signer && !(p?.kind === "static" && p.signer)) throw new Error(`${key} would have to sign this transaction.`);
    if (p && req.writable && !p.writable) throw new Error(`${key} is read-only in this transaction.`);
    if (p?.kind === "table" && req.program) {
      const l = lookups[p.table];
      l.writable = l.writable.filter((i) => !(p.writable && i === p.index));
      l.readonly = l.readonly.filter((i) => !(!p.writable && i === p.index));
      place.set(key, { kind: "static", signer: false, writable: p.writable, added: true });
      fresh.push(key);
    } else if (!p) {
      const t = req.program ? -1 : contents.findIndex((list) => list.includes(key));
      if (t >= 0) {
        const index = contents[t].indexOf(key);
        lookups[t][req.writable ? "writable" : "readonly"].push(index);
        place.set(key, { kind: "table", table: t, index, writable: req.writable });
      } else {
        place.set(key, { kind: "static", signer: false, writable: req.writable, added: true });
        fresh.push(key);
      }
    }
  }

  // rebuild the account list
  const isStatic = (k: string, writable: boolean) => { const p = place.get(k)!; return p.kind === "static" && p.writable === writable; };
  const keys = [
    ...tx.staticKeys.slice(0, sigs),
    ...tx.staticKeys.slice(sigs).filter((k) => isStatic(k, true)), ...fresh.filter((k) => isStatic(k, true)),
    ...tx.staticKeys.slice(sigs).filter((k) => isStatic(k, false)), ...fresh.filter((k) => isStatic(k, false)),
  ];
  const header = { requiredSignatures: sigs, readonlySigned, readonlyUnsigned: keys.slice(sigs).filter((k) => isStatic(k, false)).length };
  const used = lookups.map((l, t) => ({ ...l, t })).filter((l) => l.writable.length + l.readonly.length > 0);
  const order = [
    ...keys,
    ...used.flatMap((l) => l.writable.map((i) => contents[l.t][i])),
    ...used.flatMap((l) => l.readonly.map((i) => contents[l.t][i])),
  ];
  if (order.length > 256) throw new Error("The launch transaction uses too many accounts.");
  const index = new Map(order.map((k, i) => [k, i]));
  const all2 = [...instructions, ...added.map((ix) => ({ program: ix.programId, accounts: ix.accounts.map((a) => a.pubkey), data: ix.data }))];

  const parts: number[] = [];
  if (tx.version === 0) parts.push(0x80);
  parts.push(header.requiredSignatures, header.readonlySigned, header.readonlyUnsigned, ...compactU16(keys.length));
  for (const k of keys) parts.push(...bs58.decode(k));
  parts.push(...bs58.decode(tx.recentBlockhash), ...compactU16(all2.length));
  for (const ix of all2) {
    const accounts = ix.accounts.map((k) => index.get(k)!);
    parts.push(index.get(ix.program)!, ...compactU16(accounts.length), ...accounts, ...compactU16(ix.data.length), ...ix.data);
  }
  if (tx.version === 0) {
    parts.push(...compactU16(used.length));
    for (const l of used) {
      parts.push(...bs58.decode(l.table), ...compactU16(l.writable.length), ...l.writable, ...compactU16(l.readonly.length), ...l.readonly);
    }
  }
  const out = serialize(tx.signatures.map(() => new Uint8Array(64)), new Uint8Array(parts));
  if (out.length > MAX_TX_BYTES) throw new Error(`The launch transaction is too large (${out.length} of ${MAX_TX_BYTES} bytes).`);
  return out;
}

// A System transfer of `lamports` from `from` (which signs) to `to`.
export function transferInstruction(from: string, to: string, lamports: bigint): NewInstruction {
  if (lamports <= 0n || lamports >= 2n ** 64n) throw new Error("Transfer amount must be positive and below 2^64 lamports.");
  let recipient: Uint8Array | undefined;
  try {
    recipient = bs58.decode(to);
  } catch {
    recipient = undefined;
  }
  if (recipient?.length !== 32) throw new Error("The recipient must be a 32-byte base58 address.");
  if (to === from) throw new Error("Can't transfer to the fee payer.");
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true); // SystemInstruction::Transfer
  view.setBigUint64(4, lamports, true);
  return {
    programId: SYSTEM_PROGRAM,
    accounts: [{ pubkey: from, signer: true, writable: true }, { pubkey: to, signer: false, writable: true }],
    data,
  };
}

// The launch fee: one System transfer from the fee payer (`staticKeys[0]`) to `to`, added last.
export const appendTransfer = (tx: DecodedTx, tables: LookupTables, to: string, lamports: bigint): Uint8Array =>
  appendInstructions(tx, tables, [transferInstruction(tx.staticKeys[0], to, lamports)]);
