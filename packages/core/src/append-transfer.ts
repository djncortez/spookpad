// Adds the SpookPad launch fee (one System transfer from the fee payer) to the unsigned create transaction PumpPortal
// built, keeping its blockhash and address-lookup tables (spec §4.2 step 5). Static keys are ordered
// [writable signers][read-only signers][writable non-signers][read-only non-signers]; accounts loaded from lookup
// tables are numbered after the static keys, so inserting a static key at `at` shifts every index >= at by one.
import bs58 from "bs58";
import { compactU16, serialize, SYSTEM_PROGRAM, type DecodedTx, type TxInstruction } from "./solana-tx";

export const MAX_TX_BYTES = 1232;

export function appendTransfer(tx: DecodedTx, to: string, lamports: bigint): Uint8Array {
  if (lamports <= 0n) throw new Error("Transfer amount must be positive.");
  if (tx.signatures.some((s) => s.some((b) => b !== 0))) throw new Error("The transaction is already signed.");
  const header = { ...tx.header };
  const keys = [...tx.staticKeys];
  const instructions: TxInstruction[] = tx.instructions.map((ix) => ({ programIndex: ix.programIndex, accounts: [...ix.accounts], data: ix.data }));
  const insert = (key: string, at: number) => {
    keys.splice(at, 0, key);
    for (const ix of instructions) {
      if (ix.programIndex >= at) ix.programIndex++;
      ix.accounts = ix.accounts.map((a) => (a >= at ? a + 1 : a));
    }
  };

  if (to === keys[0]) throw new Error("Can't transfer to the fee payer.");
  let toIndex = keys.indexOf(to);
  if (toIndex >= 0) {
    const writableSigner = toIndex < header.requiredSignatures - header.readonlySigned;
    const writableUnsigned = toIndex >= header.requiredSignatures && toIndex < keys.length - header.readonlyUnsigned;
    if (!writableSigner && !writableUnsigned) throw new Error("The recipient is read-only in this transaction.");
  } else {
    toIndex = keys.length - header.readonlyUnsigned; // end of the writable non-signers
    insert(to, toIndex);
  }
  let system = keys.indexOf(SYSTEM_PROGRAM);
  if (system < 0) {
    system = keys.length; // a new read-only non-signer at the very end
    insert(SYSTEM_PROGRAM, system);
    header.readonlyUnsigned++;
  }
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true); // SystemInstruction::Transfer
  view.setBigUint64(4, lamports, true);
  instructions.push({ programIndex: system, accounts: [0, toIndex], data });
  if (instructions.some((ix) => ix.programIndex > 255 || ix.accounts.some((a) => a > 255))) {
    throw new Error("The launch transaction uses too many accounts to add the SpookPad fee.");
  }

  const parts: number[] = [];
  if (tx.version === 0) parts.push(0x80);
  parts.push(header.requiredSignatures, header.readonlySigned, header.readonlyUnsigned, ...compactU16(keys.length));
  for (const k of keys) parts.push(...bs58.decode(k));
  parts.push(...bs58.decode(tx.recentBlockhash), ...compactU16(instructions.length));
  for (const ix of instructions) {
    parts.push(ix.programIndex, ...compactU16(ix.accounts.length), ...ix.accounts, ...compactU16(ix.data.length), ...ix.data);
  }
  if (tx.version === 0) parts.push(...tx.lookupSection);
  const out = serialize(tx.signatures.map(() => new Uint8Array(64)), new Uint8Array(parts));
  if (out.length > MAX_TX_BYTES) throw new Error("The launch transaction is too large to add the SpookPad fee.");
  return out;
}
