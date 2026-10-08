import { describe, expect, test } from "vitest";
import bs58 from "bs58";
import { existsSync, readFileSync } from "node:fs";
import { fromBase64 } from "../src/encoding";
import { newKeypair } from "../src/keys";
import { BUY, BUY_EXACT_SOL_IN, checkCreateTx, CREATE_V1, CREATE_V2, decodeCreateArgs, isCreateData, MAX_EXTRA_TRANSFER_LAMPORTS, MAX_PRIORITY_FEE_LAMPORTS, PUMP_PROGRAM } from "../src/pump-tx";
import { decodeTransaction, encodeMessage, serialize, SYSTEM_PROGRAM, type TxInstruction } from "../src/solana-tx";

const creator = newKeypair().publicKey;
const mint = newKeypair().publicKey;
const BLOCKHASH = bs58.encode(new Uint8Array(32).fill(9));
const URI = "https://ipfs.io/ipfs/meta";
const MAX = MAX_EXTRA_TRANSFER_LAMPORTS;
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const filler = () => newKeypair().publicKey;
const str = (s: string) => { const b = new TextEncoder().encode(s); const out = new Uint8Array(4 + b.length); new DataView(out.buffer).setUint32(0, b.length, true); out.set(b, 4); return [...out]; };
const u64 = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return [...b]; };

function createData(o: { v?: 1 | 2; name?: string; uri?: string; creatorKey?: string; holder?: number; bps?: bigint; mayhem?: number; cashback?: number } = {}) {
  const v = o.v ?? 2;
  const bytes = [...(v === 2 ? CREATE_V2 : CREATE_V1), ...str(o.name ?? "Spooky Frog"), ...str("SFROG"), ...str(o.uri ?? URI),
    ...bs58.decode(o.creatorKey ?? creator)];
  if (v === 2) bytes.push(o.mayhem ?? 0, o.cashback ?? 0, ...u64(o.bps ?? 0n), o.holder ?? 0);
  return new Uint8Array(bytes);
}
const buyData = (kind: "buy" | "exact", sol: bigint) =>
  new Uint8Array(kind === "buy" ? [...BUY, ...u64(1_000_000n), ...u64(sol), 0] : [...BUY_EXACT_SOL_IN, ...u64(sol), ...u64(1n), 0]);

// keys: 0 creator (payer), 1 mint, 2..17 others, 18 pump program, 19 system program, 20 compute budget program
function tx(o: { create?: Uint8Array; buy?: Uint8Array | null; extra?: TxInstruction[]; v?: 1 | 2; createAcct?: Record<number, number>; creates?: number } = {}) {
  const v = o.v ?? 2;
  const keys = [creator, mint, ...Array.from({ length: 16 }, filler), PUMP_PROGRAM, SYSTEM_PROGRAM, COMPUTE_BUDGET];
  const createAccounts = Array.from({ length: 16 }, (_, i) => i + 2);
  createAccounts[0] = 1;
  createAccounts[v === 2 ? 5 : 7] = 0;
  for (const [i, k] of Object.entries(o.createAcct ?? {})) createAccounts[Number(i)] = k;
  const buyAccounts = Array.from({ length: 12 }, (_, i) => i + 2);
  const instructions: TxInstruction[] = [{ programIndex: 18, accounts: createAccounts, data: o.create ?? createData({ v }) }];
  for (let i = 1; i < (o.creates ?? 1); i++) instructions.push(instructions[0]);
  if (o.buy) instructions.push({ programIndex: 18, accounts: buyAccounts, data: o.buy });
  instructions.push(...(o.extra ?? []));
  const message = encodeMessage({
    version: 0, header: { requiredSignatures: 2, readonlySigned: 0, readonlyUnsigned: 2 }, staticKeys: keys, recentBlockhash: BLOCKHASH, instructions,
  });
  return decodeTransaction(serialize([new Uint8Array(64), new Uint8Array(64)], message));
}
const want = () => ({ creator, mint, name: "Spooky Frog", symbol: "SFROG", uri: URI });
const budget = (kind: 2 | 3, value: bigint, len?: number): TxInstruction => {
  const n = len ?? (kind === 2 ? 5 : 9);
  const data = new Uint8Array(n);
  data[0] = kind;
  const v = new DataView(data.buffer);
  if (kind === 2 && n >= 5) v.setUint32(1, Number(value), true);
  if (kind === 3 && n >= 9) v.setBigUint64(1, value, true);
  return { programIndex: 20, accounts: [], data };
};
const transfer = (lamports: bigint, fromIndex = 0): TxInstruction => {
  const data = new Uint8Array(12);
  new DataView(data.buffer).setUint32(0, 2, true);
  new DataView(data.buffer).setBigUint64(4, lamports, true);
  return { programIndex: 19, accounts: [fromIndex, 3], data };
};

describe("discriminators", () => {
  test("computed Anchor discriminators match pump.fun's known create and create_v2", () => {
    expect(CREATE_V1).toEqual([24, 30, 200, 40, 5, 28, 7, 119]);
    expect(CREATE_V2).toEqual([214, 144, 76, 236, 95, 139, 49, 180]);
    expect(isCreateData(createData())).toBe(true);
    expect(isCreateData(buyData("buy", 1n))).toBe(false);
  });
  test("decodes create_v2 arguments", () => {
    expect(decodeCreateArgs(createData())).toMatchObject({ version: 2, name: "Spooky Frog", symbol: "SFROG", uri: URI, creator });
  });
});

describe("checkCreateTx", () => {
  test("accepts a plain create", () => {
    expect(checkCreateTx(tx(), want())).toMatchObject({ ok: true, args: { creator } });
  });
  test("refuses create v1: SpookPad's dev buy is Token-2022 only", () => {
    const r = checkCreateTx(tx({ v: 1, create: createData({ v: 1 }) }), want());
    expect(r).toEqual({ ok: false, error: "This is an old-style create; SpookPad needs create_v2." });
  });
  test("refuses any buy: SpookPad adds its own dev buy", () => {
    expect(checkCreateTx(tx({ buy: buyData("buy", 1n) }), want())).toEqual({ ok: false, error: "PumpPortal added a dev buy; SpookPad adds its own." });
    expect(checkCreateTx(tx({ buy: buyData("exact", 1n) }), want())).toEqual({ ok: false, error: "PumpPortal added a dev buy; SpookPad adds its own." });
  });
  test("refuses an extra signer", () => {
    const t = tx();
    t.header.requiredSignatures = 3;
    expect(checkCreateTx(t, want())).toEqual({ ok: false, error: "The transaction asks for an unexpected signer." });
  });
  test("refuses a different mint or wallet in the create's accounts", () => {
    expect(checkCreateTx(tx({ createAcct: { 0: 3 } }), want())).toEqual({ ok: false, error: "The transaction creates a different mint." });
    expect(checkCreateTx(tx({ createAcct: { 5: 3 } }), want())).toEqual({ ok: false, error: "The transaction's creating wallet isn't yours." });
  });
  test("refuses two creates, a non-transfer system instruction and undecodable bytes", () => {
    expect(checkCreateTx(tx({ creates: 2 }), want())).toEqual({ ok: false, error: "The transaction creates more than one coin." });
    const sys: TxInstruction = { programIndex: 19, accounts: [0, 3], data: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]) };
    expect(checkCreateTx(tx({ extra: [sys] }), want())).toEqual({ ok: false, error: "The transaction has an unexpected system instruction." });
    expect(checkCreateTx(tx({ create: new Uint8Array([...CREATE_V2, 1, 2, 3]) }), want())).toEqual({ ok: false, error: "Create instruction is cut short." });
  });
  test("refuses malformed UTF-8 in the create's text as a checker error", () => {
    const d = createData();
    d[8 + 4] = 0xff; // first byte of the name
    expect(checkCreateTx(tx({ create: d }), want())).toEqual({ ok: false, error: "Create instruction has text that isn't valid." });
  });
  test("refuses mayhem, cashback and a creator fee override", () => {
    expect(checkCreateTx(tx({ create: createData({ mayhem: 1 }) }), want())).toEqual({ ok: false, error: "Mayhem mode is on." });
    expect(checkCreateTx(tx({ create: createData({ cashback: 1 }) }), want())).toEqual({ ok: false, error: "Cashback mode is on." });
    expect(checkCreateTx(tx({ create: createData({ bps: 50n }) }), want())).toEqual({ ok: false, error: "The transaction overrides the creator fee." });
  });
  test("refuses several small transfers that add up to more than a service fee", () => {
    expect(checkCreateTx(tx({ extra: [transfer(MAX), transfer(1n)] }), want())).toEqual({ ok: false, error: "The transaction sends more SOL than a service fee." });
    expect(checkCreateTx(tx({ extra: [transfer(MAX / 2n), transfer(MAX / 2n)] }), want()).ok).toBe(true);
  });
  test("refuses another wallet as payer", () => {
    const other = tx();
    other.staticKeys[0] = filler();
    expect(checkCreateTx(other, want())).toEqual({ ok: false, error: "Your wallet must pay for the launch transaction." });
  });
  test("refuses metadata that isn't SpookPad's", () => {
    expect(checkCreateTx(tx({ create: createData({ uri: "https://evil/x" }) }), want())).toEqual({ ok: false, error: "The coin's metadata isn't SpookPad's." });
    expect(checkCreateTx(tx({ create: createData({ name: "Other" }) }), want()).ok).toBe(false);
    expect(checkCreateTx(tx({ create: createData({ creatorKey: filler() }) }), want())).toEqual({ ok: false, error: "The creator fees would go to another wallet." });
    expect(checkCreateTx(tx({ create: createData({ holder: 1 }) }), want()).ok).toBe(false);
  });
  test("refuses unexpected programs, big transfers and other pump.fun actions", () => {
    const strange = tx();
    strange.staticKeys[18] = filler(); // the create instruction now calls an unknown program
    expect(checkCreateTx(strange, want()).ok).toBe(false);
    expect(checkCreateTx(tx({ extra: [transfer(MAX + 1n)] }), want())).toEqual({ ok: false, error: "The transaction sends more SOL than a service fee." });
    expect(checkCreateTx(tx({ extra: [transfer(1n, 2)] }), want())).toEqual({ ok: false, error: "The transaction moves SOL from an unexpected wallet." });
    expect(checkCreateTx(tx({ buy: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]) }), want())).toEqual({ ok: false, error: "The transaction does another pump.fun action." });
  });
});

describe("checkCreateTx: ComputeBudget instructions", () => {
  const fee = "The transaction's network fee is too high.";
  test("accepts a limit and a price, each once, at or under the fee cap", () => {
    // 200_000 units * 25_000_000_000 micro-lamports = 5_000_000 lamports exactly
    expect(checkCreateTx(tx({ extra: [budget(2, 200_000n), budget(3, 25_000_000n)] }), want()).ok).toBe(true);
    expect(checkCreateTx(tx({ extra: [budget(3, 1_000n)] }), want()).ok).toBe(true);
    expect(checkCreateTx(tx({ extra: [budget(2, 320_000n)] }), want()).ok).toBe(true);
    expect(MAX_PRIORITY_FEE_LAMPORTS).toBe(5_000_000n);
  });
  test("refuses a fee over the cap, rounding up", () => {
    expect(checkCreateTx(tx({ extra: [budget(2, 200_000n), budget(3, 25_000_001n)] }), want())).toEqual({ ok: false, error: fee });
    expect(checkCreateTx(tx({ extra: [budget(2, 1_400_000n), budget(3, 18_446_744_073_709_551_615n)] }), want())).toEqual({ ok: false, error: fee });
  });
  test("without a limit instruction the limit is 200_000 per other instruction", () => {
    expect(checkCreateTx(tx({ extra: [budget(3, 25_000_000n)] }), want()).ok).toBe(true); // 1 instruction
    expect(checkCreateTx(tx({ extra: [budget(3, 25_000_000n), transfer(1n)] }), want())).toEqual({ ok: false, error: fee }); // 2
  });
  test("refuses an unknown ComputeBudget instruction, duplicates and bad lengths", () => {
    const unknown: TxInstruction = { programIndex: 20, accounts: [], data: new Uint8Array([1, 0, 0, 0, 0]) };
    const bad = "The transaction has an unexpected compute-budget instruction.";
    expect(checkCreateTx(tx({ extra: [unknown] }), want())).toEqual({ ok: false, error: bad });
    expect(checkCreateTx(tx({ extra: [budget(2, 1n), budget(2, 2n)] }), want())).toEqual({ ok: false, error: bad });
    expect(checkCreateTx(tx({ extra: [budget(3, 1n), budget(3, 2n)] }), want())).toEqual({ ok: false, error: bad });
    expect(checkCreateTx(tx({ extra: [budget(2, 1n, 6)] }), want())).toEqual({ ok: false, error: bad });
    expect(checkCreateTx(tx({ extra: [budget(3, 1n, 8)] }), want())).toEqual({ ok: false, error: bad });
  });
});

// The real PumpPortal create-only transaction captured by scripts/capture-pumpportal.mjs (Task 4 step 9).
const FIXTURE = "packages/core/test/fixtures/pumpportal/launch.json";
test.skipIf(!existsSync(FIXTURE))("the live PumpPortal create passes the checker", () => {
  const f = JSON.parse(readFileSync(FIXTURE, "utf8")) as { creator: string; mint: string; name: string; symbol: string; uri: string; tx: string };
  expect(checkCreateTx(decodeTransaction(fromBase64(f.tx)), f)).toMatchObject({ ok: true, args: { version: 2, creator: f.creator } });
});
