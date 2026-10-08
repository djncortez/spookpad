import { describe, expect, test } from "vitest";
import { AddressLookupTableAccount, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { toBase64 } from "@spookpad/core/encoding";
import type { Invoke } from "../lib/call";
import { BUY_EXACT_SOL_IN, PUMP_PROGRAM } from "@spookpad/core/pump-tx";
import { checkPreparedLaunch, confirmLaunch, launchCoin } from "../lib/launch-coin";

const trader = Keypair.generate();
const BLOCKHASH = "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK";
const fields = { name: "Spooky Frog", ticker: "SFROG", description: "", twitter: null, telegram: null };
const treasury = Keypair.generate().publicKey;
const FEE = 20_000_000;
const shown = { generationId: "g1", fields, trader: trader.publicKey.toBase58(), treasury: treasury.toBase58(), launchFeeLamports: FEE };
const noTables = async () => null;
const PUMP = new PublicKey(PUMP_PROGRAM);

// A prepared launch like prepare-launch's: a pump.fun create (the mint signs), the dev buy, then the launch fee.
function preparedMessage(mint: string, o: { devBuy?: number; fee?: number; to?: PublicKey; extra?: TransactionInstruction[] } = {}) {
  const create = new TransactionInstruction({ programId: PUMP, keys: [{ pubkey: new PublicKey(mint), isSigner: true, isWritable: true }], data: Buffer.alloc(8) });
  const ixs = [create];
  if (o.devBuy) {
    const data = Buffer.alloc(26);
    data.set(BUY_EXACT_SOL_IN, 0);
    data.writeBigUInt64LE(BigInt(o.devBuy), 8);
    ixs.push(new TransactionInstruction({ programId: PUMP, keys: [{ pubkey: trader.publicKey, isSigner: true, isWritable: true }], data }));
  }
  if ((o.fee ?? FEE) > 0) ixs.push(SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: o.to ?? treasury, lamports: o.fee ?? FEE }));
  ixs.push(...(o.extra ?? []));
  return new TransactionMessage({ payerKey: trader.publicKey, recentBlockhash: BLOCKHASH, instructions: ixs });
}
const preparedTx = (mint: string, o: Parameters<typeof preparedMessage>[1] = {}) =>
  toBase64(new VersionedTransaction(preparedMessage(mint, o).compileToV0Message()).serialize());

test("prepares, has the wallet sign first, adds the mint's signature, sends and confirms", async () => {
  const bodies: Record<string, unknown>[] = [];
  let confirms = 0;
  const invoke = (async (name: string, body: Record<string, unknown>) => {
    bodies.push({ fn: name, ...body });
    if (name === "prepare-launch") {
      const mint = new PublicKey(body.mint as string);
      return { transaction: preparedTx(mint.toBase58(), { devBuy: 100_000_000 }), launch_fee_lamports: FEE };
    }
    return ++confirms < 2 ? { status: "waiting" } : { status: "live" };
  }) as Invoke;
  let sent: VersionedTransaction | null = null;
  let SIGNED = "";
  const steps: string[] = [];
  const mint = await launchCoin({
    invoke, wait: async () => {}, onStep: (s) => steps.push(s), lookupTable: noTables,
    signWithWallet: async (tx) => { tx.sign([trader]); return tx; },
    send: async (raw) => { sent = VersionedTransaction.deserialize(raw); SIGNED = bs58.encode(sent.signatures[0]); return "SIG"; },
  }, { ...shown, devBuyLamports: 100_000_000 });

  expect(bodies[0]).toEqual({ fn: "prepare-launch", generation_id: "g1", mint, ...fields, dev_buy_lamports: 100_000_000 });
  expect(bodies.slice(1)).toEqual([{ fn: "confirm-launch", mint, signature: SIGNED }, { fn: "confirm-launch", mint, signature: SIGNED }]);
  expect(sent!.signatures).toHaveLength(2);
  expect(sent!.signatures.every((s) => s.some((b) => b !== 0))).toBe(true); // both the trader and the mint signed
  expect(steps).toEqual(["preparing", "signing", "sending", "confirming"]);
});

test("a second launch uses a fresh mint and sends only its own prepared transaction", async () => {
  const mints: string[] = [];
  const sentMints: string[] = [];
  const invoke = (async (name: string, body: Record<string, unknown>) => {
    if (name === "prepare-launch") {
      mints.push(body.mint as string);
      return { transaction: preparedTx(body.mint as string) };
    }
    return { status: "live" };
  }) as Invoke;
  const deps = {
    invoke, wait: async () => {}, lookupTable: noTables,
    signWithWallet: async (tx: VersionedTransaction) => { tx.sign([trader]); return tx; },
    send: async (raw: Uint8Array) => { sentMints.push(VersionedTransaction.deserialize(raw).message.staticAccountKeys[1].toBase58()); return "SIG"; },
  };
  const p = { ...shown, devBuyLamports: 0 };
  await launchCoin(deps, p);
  await launchCoin(deps, p);
  expect(new Set(mints).size).toBe(2);
  expect(sentMints).toEqual(mints); // each send carries the mint prepared in that same run
});

test("when the wallet refuses to sign, nothing is sent", async () => {
  const invoke = (async (_n: string, body: Record<string, unknown>) => ({ transaction: preparedTx(body.mint as string) })) as Invoke;
  let sends = 0;
  await expect(launchCoin({
    invoke, wait: async () => {}, lookupTable: noTables, signWithWallet: async () => { throw new Error("wrong wallet"); },
    send: async () => { sends++; return "SIG"; },
  }, { ...shown, devBuyLamports: 0 })).rejects.toThrow("wrong wallet");
  expect(sends).toBe(0);
});

describe("confirmLaunch", () => {
  test("checks the same mint and signature again", async () => {
    const calls: unknown[] = [];
    const invoke = (async (_n: string, body: unknown) => { calls.push(body); return { status: "live" }; }) as Invoke;
    expect(await confirmLaunch({ invoke, wait: async () => {} }, "MINT", "SIG")).toBe("MINT");
    expect(calls).toEqual([{ mint: "MINT", signature: "SIG" }]);
  });
});

describe("onSent", () => {
  const prepared = (async (name: string, body: Record<string, unknown>) => {
    if (name !== "prepare-launch") return { status: "live" };
    return { transaction: preparedTx(body.mint as string) };
  }) as Invoke;

  test("is called with the real signature and blockhash before send", async () => {
    const order: string[] = [];
    let told: unknown[] = [];
    let sentSignature = "";
    await launchCoin({
      invoke: prepared, wait: async () => {}, lookupTable: noTables,
      signWithWallet: async (tx) => { tx.sign([trader]); return tx; },
      onSent: (m, sig, exp) => { order.push("onSent"); told = [m, sig, exp]; },
      send: async (raw) => { order.push("send"); sentSignature = bs58.encode(VersionedTransaction.deserialize(raw).signatures[0]); return "x"; },
    }, { ...shown, devBuyLamports: 0 });
    expect(order).toEqual(["onSent", "send"]);
    expect(told[1]).toBe(sentSignature);
    expect(told[2]).toEqual({ blockhash: BLOCKHASH });
  });

  test("is not called when signing fails", async () => {
    let calls = 0;
    await expect(launchCoin({
      invoke: prepared, wait: async () => {}, lookupTable: noTables, signWithWallet: async () => { throw new Error("no"); },
      onSent: () => { calls++; }, send: async () => "x",
    }, { ...shown, devBuyLamports: 0 })).rejects.toThrow("no");
    expect(calls).toBe(0);
  });
});

describe("checkPreparedLaunch", () => {
  const mint = Keypair.generate().publicKey.toBase58();
  const tx = (o: Parameters<typeof preparedMessage>[1] = {}) => VersionedTransaction.deserialize(Buffer.from(preparedTx(mint, o), "base64"));
  const want = (devBuyLamports = 0) => ({ trader: trader.publicKey.toBase58(), treasury: treasury.toBase58(), launchFeeLamports: FEE, devBuyLamports });

  test("accepts the launch fee to the treasury and the dev buy shown", async () => {
    expect(await checkPreparedLaunch(tx({ devBuy: 5_000 }), want(5_000), noTables)).toBeNull();
    expect(await checkPreparedLaunch(tx(), want(0), noTables)).toBeNull();
  });
  test("refuses a fee to another wallet, a different fee, or no fee", async () => {
    expect(await checkPreparedLaunch(tx({ to: Keypair.generate().publicKey }), want(), noTables)).toMatch(/isn't SpookPad's treasury/);
    expect(await checkPreparedLaunch(tx({ fee: FEE + 1 }), want(), noTables)).toMatch(/launch fee/);
    expect(await checkPreparedLaunch(tx({ fee: 0 }), want(), noTables)).toMatch(/launch fee/);
  });
  test("refuses an extra transfer, even a small one to another wallet", async () => {
    const extra = SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 });
    expect(await checkPreparedLaunch(tx({ extra: [extra] }), want(), noTables)).toMatch(/isn't SpookPad's treasury/);
  });
  test("refuses a dev buy that isn't the one entered", async () => {
    expect(await checkPreparedLaunch(tx({ devBuy: 6_000 }), want(5_000), noTables)).toMatch(/dev buy/);
    expect(await checkPreparedLaunch(tx(), want(5_000), noTables)).toMatch(/dev buy/);
    expect(await checkPreparedLaunch(tx({ devBuy: 5_000 }), want(0), noTables)).toMatch(/dev buy/);
  });
  test("refuses when no treasury is configured, or someone else pays", async () => {
    expect(await checkPreparedLaunch(tx(), { ...want(), treasury: "" }, noTables)).toMatch(/treasury address isn't set up/);
    expect(await checkPreparedLaunch(tx(), { ...want(), trader: Keypair.generate().publicKey.toBase58() }, noTables)).toMatch(/doesn't pay/);
  });
  test("resolves a treasury loaded from an address lookup table", async () => {
    const tableKey = Keypair.generate().publicKey;
    const table = new AddressLookupTableAccount({ key: tableKey, state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: [treasury] } });
    const v0 = new VersionedTransaction(preparedMessage(mint).compileToV0Message([table]));
    expect(v0.message.addressTableLookups).toHaveLength(1); // the treasury really is loaded from the table
    const asked: string[] = [];
    expect(await checkPreparedLaunch(v0, want(), async (k) => { asked.push(k.toBase58()); return table; })).toBeNull();
    expect(asked).toEqual([tableKey.toBase58()]);
    expect(await checkPreparedLaunch(v0, want(), noTables)).toMatch(/address tables/);
  });
  test("launchCoin never asks the wallet to sign a mismatching transaction", async () => {
    const invoke = (async (_n: string, body: Record<string, unknown>) => ({ transaction: preparedTx(body.mint as string, { fee: FEE * 2 }) })) as Invoke;
    let signs = 0;
    await expect(launchCoin({ invoke, wait: async () => {}, lookupTable: noTables, signWithWallet: async (t) => { signs++; return t; }, send: async () => "x" },
      { ...shown, devBuyLamports: 0 })).rejects.toThrow(/didn't match what SpookPad showed: the launch fee isn't the one shown \(reload the page to see the current fee\)\. Nothing was signed\./);
    expect(signs).toBe(0);
  });
});
