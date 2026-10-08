import { describe, expect, test } from "vitest";
import bs58 from "bs58";
import { SYSTEM_PROGRAM_ID, type ParsedTransaction } from "../src/fee-check";
import { checkLaunchTx } from "../src/launch-check";
import { BUY_EXACT_SOL_IN, CREATE_V1, CREATE_V2, PUMP_PROGRAM } from "../src/pump-tx";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const TREASURY = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const URI = "https://ipfs.io/ipfs/meta";
const u64 = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return [...b]; };
const str = (s: string) => { const b = new TextEncoder().encode(s); const out = new Uint8Array(4 + b.length); new DataView(out.buffer).setUint32(0, b.length, true); out.set(b, 4); return [...out]; };
const createData = (o: { uri?: string; creator?: string; v1?: boolean; name?: string; symbol?: string } = {}) =>
  bs58.encode(new Uint8Array([...(o.v1 ? CREATE_V1 : CREATE_V2), ...str(o.name ?? "Spooky Frog"), ...str(o.symbol ?? "SFROG"), ...str(o.uri ?? URI), ...bs58.decode(o.creator ?? WALLET), ...(o.v1 ? [] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]));

function launchTx(o: { err?: unknown; mintSigner?: boolean; data?: string; fee?: number | null; payer?: string; buy?: boolean } = {}): ParsedTransaction {
  return {
    meta: { err: o.err ?? null },
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [{ pubkey: o.payer ?? WALLET, signer: true }, { pubkey: MINT, signer: o.mintSigner ?? true }, { pubkey: TREASURY, signer: false }],
        instructions: [
          { programId: PUMP_PROGRAM, accounts: [MINT, "a", "b", "c", "d", WALLET], data: o.data ?? createData() },
          ...(o.buy ? [ // SpookPad's own dev buy (Task 4)
            { programId: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", program: "spl-associated-token-account", parsed: { type: "createIdempotent", info: {} } },
            { programId: PUMP_PROGRAM, accounts: ["global", "fee", MINT, "curve", "curve-ata", "ata", WALLET],
              data: bs58.encode(new Uint8Array([...BUY_EXACT_SOL_IN, ...u64(10_000_000n), ...u64(1n), 1, 0])) },
          ] : []),
          ...(o.fee === null ? [] : [{ programId: SYSTEM_PROGRAM_ID, program: "system",
            parsed: { type: "transfer", info: { source: WALLET, destination: TREASURY, lamports: o.fee ?? 20_000_000 } } }]),
        ],
      },
    },
  };
}
const want = { wallet: WALLET, mint: MINT, treasury: TREASURY, launchFeeLamports: 20_000_000, name: "Spooky Frog", symbol: "SFROG", uri: URI };

describe("checkLaunchTx", () => {
  test("SpookPad's prepared launch passes, with or without its dev buy", () => {
    expect(checkLaunchTx(launchTx(), want)).toBeNull();
    expect(checkLaunchTx(launchTx({ buy: true }), want)).toBeNull();
  });
  test("a failed or someone else's transaction doesn't", () => {
    expect(checkLaunchTx(launchTx({ err: "x" }), want)).toBe("The launch transaction failed on-chain.");
    expect(checkLaunchTx(launchTx({ payer: MINT }), want)).toBe("The launch must come from your signed-in wallet.");
    expect(checkLaunchTx(launchTx({ mintSigner: false }), want)).toBe("That transaction doesn't create this coin.");
  });
  test("the coin must be the one SpookPad prepared", () => {
    expect(checkLaunchTx(launchTx({ data: createData({ uri: "https://ipfs.io/ipfs/original" }) }), want)).toBe("That coin isn't the one SpookPad prepared.");
    expect(checkLaunchTx(launchTx({ data: createData({ creator: TREASURY }) }), want)).toBe("That coin isn't the one SpookPad prepared.");
    expect(checkLaunchTx(launchTx({ data: "1111" }), want)).toBe("That transaction doesn't create this coin.");
  });
  test("only create_v2 (Token-2022) launches pass", () => {
    expect(checkLaunchTx(launchTx({ data: createData({ v1: true }) }), want)).toBe("That transaction doesn't create this coin.");
  });
  test("a different name or ticker is refused", () => {
    expect(checkLaunchTx(launchTx({ data: createData({ name: "Other" }) }), want)).toBe("That coin isn't the one SpookPad prepared.");
    expect(checkLaunchTx(launchTx({ data: createData({ symbol: "OTHER" }) }), want)).toBe("That coin isn't the one SpookPad prepared.");
  });
  test("a create for a different mint is refused even if the wanted mint signs", () => {
    const tx = launchTx();
    tx.transaction.message.instructions[0].accounts = [TREASURY, "a", "b", "c", "d", WALLET];
    expect(checkLaunchTx(tx, want)).toBe("That transaction doesn't create this coin.");
  });
  test("the launch fee must be paid unless it is 0", () => {
    expect(checkLaunchTx(launchTx({ fee: null }), want)).toBe("That transaction doesn't pay the SpookPad launch fee.");
    expect(checkLaunchTx(launchTx({ fee: 1 }), want)).toBe("That transaction doesn't pay the SpookPad launch fee.");
    expect(checkLaunchTx(launchTx({ fee: null }), { ...want, launchFeeLamports: 0 })).toBeNull();
  });
});
