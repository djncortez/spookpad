import { describe, expect, test } from "vitest";
import { checkFeePayment, feeMemo, MEMO_PROGRAM_ID, SYSTEM_PROGRAM_ID, type ParsedTransaction } from "../src/fee-check";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const TREASURY = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OTHER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const GEN = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

// The shape of a mainnet getTransaction(jsonParsed) result: compute budget, memo, then the SOL transfer.
function feeTx(o: { payer?: string; signer?: boolean; memo?: string | null; to?: string; lamports?: number; err?: unknown; noMeta?: boolean } = {}): ParsedTransaction {
  const payer = o.payer ?? WALLET;
  return {
    blockTime: 1790628516,
    meta: o.noMeta ? null : { err: o.err ?? null },
    transaction: {
      signatures: ["62gVEr8pk9j2wvMXbTNNGYuriA1afWX3CitakYeUgfJYsC5fc89BBxsMeVLAUBEVGcPcezevVEPZ3kyB8o16Pw3z"],
      message: {
        accountKeys: [{ pubkey: payer, signer: o.signer ?? true }, { pubkey: TREASURY, signer: false }],
        instructions: [
          { programId: "ComputeBudget111111111111111111111111111111", data: "3gJqkocMWaMm" },
          ...(o.memo === null ? [] : [{ programId: MEMO_PROGRAM_ID, program: "spl-memo", parsed: o.memo ?? feeMemo(GEN) }]),
          { programId: SYSTEM_PROGRAM_ID, program: "system",
            parsed: { type: "transfer", info: { source: payer, destination: o.to ?? TREASURY, lamports: o.lamports ?? 1_000_000 } } },
        ],
      },
    },
  };
}
const want = { wallet: WALLET, treasury: TREASURY, lamports: 1_000_000, memo: feeMemo(GEN) };

describe("checkFeePayment", () => {
  test("the memo names the generation", () => {
    expect(feeMemo(GEN)).toBe(`spookpad:${GEN}`);
  });
  test("a transfer of the fee to the treasury with the memo is a payment; more is fine", () => {
    expect(checkFeePayment(feeTx(), want)).toBeNull();
    expect(checkFeePayment(feeTx({ lamports: 2_000_000 }), want)).toBeNull();
  });
  test("failed transactions don't count", () => {
    expect(checkFeePayment(feeTx({ err: { InstructionError: [2, "Custom"] } }), want)).toBe("That payment failed on-chain.");
    expect(checkFeePayment(feeTx({ noMeta: true }), want)).toBe("That payment failed on-chain.");
  });
  test("it must come from the signed-in wallet", () => {
    expect(checkFeePayment(feeTx({ payer: OTHER }), want)).toBe("The payment must come from your signed-in wallet.");
    expect(checkFeePayment(feeTx({ signer: false }), want)).toBe("The payment must come from your signed-in wallet.");
  });
  test("it must carry this costume's memo", () => {
    expect(checkFeePayment(feeTx({ memo: null }), want)).toBe("That payment isn't for this costume.");
    expect(checkFeePayment(feeTx({ memo: feeMemo("00000000-0000-4000-8000-000000000000") }), want)).toBe("That payment isn't for this costume.");
  });
  test("it must pay enough to the treasury", () => {
    expect(checkFeePayment(feeTx({ lamports: 999_999 }), want)).toBe("That payment doesn't send 0.001 SOL to the SpookPad treasury.");
    expect(checkFeePayment(feeTx({ to: OTHER }), want)).toBe("That payment doesn't send 0.001 SOL to the SpookPad treasury.");
  });
});
