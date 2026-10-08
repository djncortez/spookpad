import { describe, expect, test } from "vitest";
import {
  AddressLookupTableAccount, Keypair, PublicKey, SystemInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { MAX_TX_BYTES } from "../src/append-transfer";
import { fromBase64 } from "../src/encoding";
import {
  ASSOCIATED_TOKEN_PROGRAM, associatedTokenAddress, buildLaunchTx, BUYBACK_FEE_RECIPIENTS, devBuyInstructions, FEE_RECIPIENTS, findProgramAddress,
  pickRecipient, PUMP_FEE_PROGRAM, pumpBuyAccounts, TOKEN_2022_PROGRAM,
} from "../src/pump-buy";
import { BUY_EXACT_SOL_IN, checkCreateTx, CREATE_V1, CREATE_V2, PUMP_PROGRAM } from "../src/pump-tx";
import { decodeTransaction, encodeMessage, loadedAddresses, serialize, SYSTEM_PROGRAM, type DecodedTx, type LookupTables } from "../src/solana-tx";

const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

describe("program addresses", () => {
  test("findProgramAddress matches web3.js", () => {
    for (let i = 0; i < 40; i++) {
      const seed = Keypair.generate().publicKey;
      const program = Keypair.generate().publicKey;
      const [want] = PublicKey.findProgramAddressSync([Buffer.from("seed"), seed.toBuffer()], program);
      expect(findProgramAddress([new TextEncoder().encode("seed"), seed.toBytes()], program.toBase58())).toBe(want.toBase58());
    }
  });

  test("buy accounts match the ones pump.fun used on mainnet (PumpPortal dev buy, 2026-10-08)", () => {
    const mint = "8i74aWLdbZg1LjE5Vgs3jMHfpMXN4fbQFxhZYVYSfVy5";
    const trader = "9gyU7rjUTAexbEjKQLxwMrCAL5z8DatFZxBeXRWPmgZ";
    expect(pumpBuyAccounts(mint, trader)).toEqual({
      global: "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
      bondingCurve: "4WjqMTGVL2s2APgLnYfPydicLVB3hrBJZNQZ9w5qFnYU",
      associatedBondingCurve: "HXW7YVQTpayPiRL6PXmEeH7V9rS4P7Q8iheupAxiAeyA",
      associatedUser: "B5t146YqeQtZ2Ab4ccTiVp2siJ2cFAHV2mPCLQou2dDe",
      creatorVault: "HEjX8PBDUk9xc8ynKcpg4aLZdTHPbY6ThyRTjVDfrWyV",
      eventAuthority: "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
      globalVolumeAccumulator: "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y",
      userVolumeAccumulator: "BhRJoM4pUj7SPsH3czkT6b7qEKBr8JYHp6hqkLMAhkNn",
      feeConfig: "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt",
      bondingCurveV2: "A3UJxtqLz2kdEGHRMuEPeuydTZXvvMPxAfBAfXutUYGE",
    });
    expect(associatedTokenAddress(trader, mint)).toBe("B5t146YqeQtZ2Ab4ccTiVp2siJ2cFAHV2mPCLQou2dDe");
  });
});

describe("devBuyInstructions", () => {
  const trader = Keypair.generate().publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();
  const buy = { trader, mint, lamports: 250_000_000n, feeRecipient: FEE_RECIPIENTS[0], buybackFeeRecipient: BUYBACK_FEE_RECIPIENTS[7] };

  test("creates the trader's token account, then buy_exact_sol_in for exactly the chosen SOL", () => {
    const [ata, ix] = devBuyInstructions(buy);
    const a = pumpBuyAccounts(mint, trader);
    expect(ata.programId).toBe(ASSOCIATED_TOKEN_PROGRAM);
    expect(Array.from(ata.data)).toEqual([1]);
    expect(ata.accounts.map((m) => [m.pubkey, m.signer, m.writable])).toEqual([
      [trader, true, true], [a.associatedUser, false, true], [trader, false, false], [mint, false, false],
      [SYSTEM_PROGRAM, false, false], [TOKEN_2022_PROGRAM, false, false],
    ]);
    expect(ix.programId).toBe(PUMP_PROGRAM);
    expect(ix.accounts.map((m) => [m.pubkey, m.signer, m.writable])).toEqual([
      [a.global, false, false], [FEE_RECIPIENTS[0], false, true], [mint, false, false], [a.bondingCurve, false, true],
      [a.associatedBondingCurve, false, true], [a.associatedUser, false, true], [trader, true, true], [SYSTEM_PROGRAM, false, false],
      [TOKEN_2022_PROGRAM, false, false], [a.creatorVault, false, true], [a.eventAuthority, false, false], [PUMP_PROGRAM, false, false],
      [a.globalVolumeAccumulator, false, false], [a.userVolumeAccumulator, false, true], [a.feeConfig, false, false],
      [PUMP_FEE_PROGRAM, false, false], [a.bondingCurveV2, false, false], [BUYBACK_FEE_RECIPIENTS[7], false, true],
    ]);
    const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    expect(Array.from(ix.data.slice(0, 8))).toEqual(BUY_EXACT_SOL_IN);
    expect(Array.from(BUY_EXACT_SOL_IN)).toEqual([56, 252, 116, 8, 158, 223, 205, 95]); // idl/pump.json
    expect([view.getBigUint64(8, true), view.getBigUint64(16, true), ix.data[24], ix.data[25], ix.data.length]).toEqual([250_000_000n, 1n, 1, 0, 26]);
  });

  test("refuses a zero buy and fee recipients pump.fun doesn't list", () => {
    expect(() => devBuyInstructions({ ...buy, lamports: 0n })).toThrow(/positive/);
    expect(() => devBuyInstructions({ ...buy, lamports: 2n ** 64n })).toThrow(/out of range/);
    expect(() => devBuyInstructions({ ...buy, feeRecipient: trader })).toThrow(/fee recipient/);
    expect(() => devBuyInstructions({ ...buy, buybackFeeRecipient: FEE_RECIPIENTS[0] })).toThrow(/buyback/);
  });

  test("pickRecipient prefers an address a lookup table already holds", () => {
    expect(pickRecipient(FEE_RECIPIENTS, [trader, FEE_RECIPIENTS[5]])).toBe(FEE_RECIPIENTS[5]);
    expect(pickRecipient(FEE_RECIPIENTS, [])).toBe(FEE_RECIPIENTS[0]);
  });
});

describe("buildLaunchTx defends its own preconditions", () => {
  const trader = Keypair.generate().publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();
  const str = (v: string) => { const b = new TextEncoder().encode(v); const out = new Uint8Array(4 + b.length); new DataView(out.buffer).setUint32(0, b.length, true); out.set(b, 4); return [...out]; };
  const create = (v: 1 | 2) => new Uint8Array([...(v === 2 ? CREATE_V2 : CREATE_V1), ...str("N"), ...str("S"), ...str("U"), ...new PublicKey(trader).toBytes()]);
  // keys: 0 trader, 1 mint, 2 pump program; the create's account 0 is `mintIndex`
  const created = (v: 1 | 2, mintIndex = 1): DecodedTx => decodeTransaction(serialize([new Uint8Array(64), new Uint8Array(64)], encodeMessage({
    version: 0, header: { requiredSignatures: 2, readonlySigned: 0, readonlyUnsigned: 1 }, staticKeys: [trader, mint, PUMP_PROGRAM],
    recentBlockhash: new PublicKey(new Uint8Array(32).fill(7)).toBase58(),
    instructions: [{ programIndex: 2, accounts: [mintIndex, 0], data: create(v) }],
  })));
  const parts = { trader, mint, devBuyLamports: 0n, treasury: trader, launchFeeLamports: 0n };
  test("builds when the preconditions hold", () => {
    expect(buildLaunchTx(created(2), {}, parts).length).toBeGreaterThan(0);
  });
  test("throws when the trader isn't the fee payer", () => {
    expect(() => buildLaunchTx(created(2), {}, { ...parts, trader: mint })).toThrow(/pay/);
  });
  test("throws when the create is for another mint", () => {
    expect(() => buildLaunchTx(created(2, 0), {}, parts)).toThrow(/mint/);
  });
  test("throws when the create isn't v2", () => {
    expect(() => buildLaunchTx(created(1), {}, parts)).toThrow(/create_v2/);
  });
});

// The whole launch transaction on a real PumpPortal create (scripts/capture-pumpportal.mjs, Task 4 step 9).
const FIXTURE = "packages/core/test/fixtures/pumpportal/launch.json";
interface LaunchFixture { creator: string; mint: string; name: string; symbol: string; uri: string; tx: string; tables: LookupTables }

describe("launch transaction on the live PumpPortal fixture", () => {
  test.skipIf(!existsSync(FIXTURE))("PumpPortal's create passes the checker; SpookPad's buy and fee fit, call only allowed programs, list each account once", () => {
    const f = JSON.parse(readFileSync(FIXTURE, "utf8")) as LaunchFixture;
    expect(checkCreateTx(decodeTransaction(fromBase64(f.tx)), f)).toMatchObject({ ok: true });
    const treasury = Keypair.generate().publicKey.toBase58();
    const nothing = buildLaunchTx(decodeTransaction(fromBase64(f.tx)), f.tables, { trader: f.creator, mint: f.mint, devBuyLamports: 0n, treasury, launchFeeLamports: 0n });
    expect(nothing).toEqual(fromBase64(f.tx)); // nothing to add: PumpPortal's bytes, unchanged
    for (const devBuy of [0n, 10_000_000n, 5_000_000_000n]) {
      const bytes = buildLaunchTx(decodeTransaction(fromBase64(f.tx)), f.tables,
        { trader: f.creator, mint: f.mint, devBuyLamports: devBuy, treasury, launchFeeLamports: 20_000_000n });
      expect(bytes.length).toBeLessThanOrEqual(MAX_TX_BYTES);
      const tx = decodeTransaction(bytes);
      const all = [...tx.staticKeys, ...loadedAddresses(tx, f.tables)];
      expect(new Set(all).size).toBe(all.length);
      const programs = new Set(tx.instructions.map((ix) => tx.staticKeys[ix.programIndex]));
      expect([...programs].every((p) => [PUMP_PROGRAM, SYSTEM_PROGRAM, COMPUTE_BUDGET, ASSOCIATED_TOKEN_PROGRAM].includes(p))).toBe(true);
      expect(tx.staticKeys.slice(0, tx.header.requiredSignatures).sort()).toEqual([f.creator, f.mint].sort());
      const alts = Object.entries(f.tables).map(([key, addresses]) => new AddressLookupTableAccount({
        key: new PublicKey(key),
        state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: addresses.map((a) => new PublicKey(a)) },
      }));
      const ixs = TransactionMessage.decompile(VersionedTransaction.deserialize(bytes).message, { addressLookupTableAccounts: alts }).instructions;
      const last = SystemInstruction.decodeTransfer(ixs[ixs.length - 1]);
      expect([last.fromPubkey.toBase58(), last.toPubkey.toBase58(), BigInt(last.lamports)]).toEqual([f.creator, treasury, 20_000_000n]);
      if (devBuy > 0n) {
        const buy = ixs[ixs.length - 2];
        const want = devBuyInstructions({ trader: f.creator, mint: f.mint, lamports: devBuy, feeRecipient: FEE_RECIPIENTS[0], buybackFeeRecipient: BUYBACK_FEE_RECIPIENTS[0] })[1];
        expect(buy.programId.toBase58()).toBe(PUMP_PROGRAM);
        // same accounts (the two fee recipients are picked from the lookup table), each with at least the rights asked for
        expect(buy.keys.map((k, i) => (i === 1 || i === 17 ? "recipient" : k.pubkey.toBase58())))
          .toEqual(want.accounts.map((m, i) => (i === 1 || i === 17 ? "recipient" : m.pubkey)));
        expect(buy.keys.every((k, i) => (k.isSigner || !want.accounts[i].signer) && (k.isWritable || !want.accounts[i].writable))).toBe(true);
        expect(new DataView(buy.data.buffer, buy.data.byteOffset).getBigUint64(8, true)).toBe(devBuy);
      }
    }
  });
});
