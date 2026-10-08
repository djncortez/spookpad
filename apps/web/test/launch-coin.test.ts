import { describe, expect, test } from "vitest";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { toBase64 } from "@spookpad/core/encoding";
import type { Invoke } from "../lib/call";
import { confirmLaunch, launchCoin } from "../lib/launch-coin";

const trader = Keypair.generate();
const BLOCKHASH = "EQUqMeuM87uiVqgHwRqBHY8gFmztyTP9Sbi39Do4fHgK";
const fields = { name: "Spooky Frog", ticker: "SFROG", description: "", twitter: null, telegram: null };

test("prepares, has the wallet sign first, adds the mint's signature, sends and confirms", async () => {
  const bodies: Record<string, unknown>[] = [];
  let confirms = 0;
  const invoke = (async (name: string, body: Record<string, unknown>) => {
    bodies.push({ fn: name, ...body });
    if (name === "prepare-launch") {
      const mint = new PublicKey(body.mint as string);
      const ix = new TransactionInstruction({ programId: SystemProgram.programId, keys: [{ pubkey: mint, isSigner: true, isWritable: true }], data: Buffer.alloc(0) });
      const msg = new TransactionMessage({ payerKey: trader.publicKey, recentBlockhash: BLOCKHASH, instructions: [ix] }).compileToV0Message();
      return { transaction: toBase64(new VersionedTransaction(msg).serialize()), launch_fee_lamports: 20_000_000 };
    }
    return ++confirms < 2 ? { status: "waiting" } : { status: "live" };
  }) as Invoke;
  let sent: VersionedTransaction | null = null;
  let SIGNED = "";
  const steps: string[] = [];
  const mint = await launchCoin({
    invoke, wait: async () => {}, onStep: (s) => steps.push(s),
    signWithWallet: async (tx) => { tx.sign([trader]); return tx; },
    send: async (raw) => { sent = VersionedTransaction.deserialize(raw); SIGNED = bs58.encode(sent.signatures[0]); return "SIG"; },
  }, { generationId: "g1", fields, devBuyLamports: 100_000_000 });

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
      const ix = new TransactionInstruction({ programId: SystemProgram.programId, keys: [{ pubkey: new PublicKey(body.mint as string), isSigner: true, isWritable: true }], data: Buffer.alloc(0) });
      const msg = new TransactionMessage({ payerKey: trader.publicKey, recentBlockhash: BLOCKHASH, instructions: [ix] }).compileToV0Message();
      return { transaction: toBase64(new VersionedTransaction(msg).serialize()) };
    }
    return { status: "live" };
  }) as Invoke;
  const deps = {
    invoke, wait: async () => {},
    signWithWallet: async (tx: VersionedTransaction) => { tx.sign([trader]); return tx; },
    send: async (raw: Uint8Array) => { sentMints.push(VersionedTransaction.deserialize(raw).message.staticAccountKeys[1].toBase58()); return "SIG"; },
  };
  const p = { generationId: "g1", fields, devBuyLamports: 0 };
  await launchCoin(deps, p);
  await launchCoin(deps, p);
  expect(new Set(mints).size).toBe(2);
  expect(sentMints).toEqual(mints); // each send carries the mint prepared in that same run
});

test("when the wallet refuses to sign, nothing is sent", async () => {
  const invoke = (async () => {
    const msg = new TransactionMessage({ payerKey: trader.publicKey, recentBlockhash: BLOCKHASH, instructions: [] }).compileToV0Message();
    return { transaction: toBase64(new VersionedTransaction(msg).serialize()) };
  }) as Invoke;
  let sends = 0;
  await expect(launchCoin({
    invoke, wait: async () => {}, signWithWallet: async () => { throw new Error("wrong wallet"); },
    send: async () => { sends++; return "SIG"; },
  }, { generationId: "g1", fields, devBuyLamports: 0 })).rejects.toThrow("wrong wallet");
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
    const ix = new TransactionInstruction({ programId: SystemProgram.programId, keys: [{ pubkey: new PublicKey(body.mint as string), isSigner: true, isWritable: true }], data: Buffer.alloc(0) });
    const msg = new TransactionMessage({ payerKey: trader.publicKey, recentBlockhash: BLOCKHASH, instructions: [ix] }).compileToV0Message();
    return { transaction: toBase64(new VersionedTransaction(msg).serialize()) };
  }) as Invoke;

  test("is called with the real signature and blockhash before send", async () => {
    const order: string[] = [];
    let told: unknown[] = [];
    let sentSignature = "";
    await launchCoin({
      invoke: prepared, wait: async () => {},
      signWithWallet: async (tx) => { tx.sign([trader]); return tx; },
      onSent: (m, sig, exp) => { order.push("onSent"); told = [m, sig, exp]; },
      send: async (raw) => { order.push("send"); sentSignature = bs58.encode(VersionedTransaction.deserialize(raw).signatures[0]); return "x"; },
    }, { generationId: "g1", fields, devBuyLamports: 0 });
    expect(order).toEqual(["onSent", "send"]);
    expect(told[1]).toBe(sentSignature);
    expect(told[2]).toEqual({ blockhash: BLOCKHASH });
  });

  test("is not called when signing fails", async () => {
    let calls = 0;
    await expect(launchCoin({
      invoke: prepared, wait: async () => {}, signWithWallet: async () => { throw new Error("no"); },
      onSent: () => { calls++; }, send: async () => "x",
    }, { generationId: "g1", fields, devBuyLamports: 0 })).rejects.toThrow("no");
    expect(calls).toBe(0);
  });
});
