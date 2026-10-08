// SpookPad's own pump.fun dev buy, added after the create in the same transaction (spec §4.2 step 5): the trader's
// Token-2022 account for the new coin (Associated Token createIdempotent), then pump.fun `buy_exact_sol_in` spending
// exactly the SOL the trader chose. The curve is created earlier in the same transaction, so no one can trade before
// this buy. Accounts and seeds: pump-fun/pump-public-docs idl/pump.json (buy_exact_sol_in, 16 accounts) plus the two
// trailing accounts every bonding-curve buy has needed since pump.fun's April upgrade (docs/BREAKING_FEE_RECIPIENT.md;
// @pump-fun/pump-sdk 3.2.0 getBuyInstructionInternal): bonding_curve_v2 (read-only) and a buyback fee recipient
// (writable). Checked against a live PumpPortal dev buy and a mainnet simulation on 2026-10-08.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { appendInstructions, transferInstruction, type NewInstruction } from "./append-transfer";
import { utf8 } from "./encoding";
import { BUY_EXACT_SOL_IN, decodeCreateArgs, isCreateData, PUMP_PROGRAM } from "./pump-tx";
import { accountOf, programOf, SYSTEM_PROGRAM, type DecodedTx, type LookupTables } from "./solana-tx";

export const PUMP_FEE_PROGRAM = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
// pump-public-docs docs/FEE_RECIPIENTS.md: protocol fee recipients for non-mayhem coins, and buyback fee recipients
export const FEE_RECIPIENTS = [
  "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV", "7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ",
  "7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX", "9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz",
  "AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY", "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM",
  "FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz", "G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP",
];
export const BUYBACK_FEE_RECIPIENTS = [
  "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD", "9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
  "GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL", "3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
  "5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6", "EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
  "5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD", "A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW",
];

const onCurve = (bytes: Uint8Array): boolean => {
  try {
    ed25519.Point.fromBytes(bytes, true); // zip215: accept what Solana's curve check accepts
    return true;
  } catch {
    return false;
  }
};

// Solana's find_program_address: the first bump from 255 down whose hash is not an ed25519 point.
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const tail = [...bs58.decode(programId), ...utf8("ProgramDerivedAddress")];
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(new Uint8Array([...seeds.flatMap((s) => [...s]), bump, ...tail]));
    if (!onCurve(hash)) return bs58.encode(hash);
  }
  throw new Error("No program address found.");
}

const key = (address: string) => bs58.decode(address);
const pda = (programId: string, ...seeds: (string | Uint8Array)[]) =>
  findProgramAddress(seeds.map((s) => (typeof s === "string" ? utf8(s) : s)), programId);

export const associatedTokenAddress = (owner: string, mint: string, tokenProgram = TOKEN_2022_PROGRAM): string =>
  pda(ASSOCIATED_TOKEN_PROGRAM, key(owner), key(tokenProgram), key(mint));

export interface PumpBuyAccounts {
  global: string;
  bondingCurve: string;
  associatedBondingCurve: string;
  associatedUser: string;
  creatorVault: string;
  eventAuthority: string;
  globalVolumeAccumulator: string;
  userVolumeAccumulator: string;
  feeConfig: string;
  bondingCurveV2: string;
}

// The derived accounts of a buy of a create_v2 coin (Token-2022) by `trader`, who is also the coin's creator.
export function pumpBuyAccounts(mint: string, trader: string): PumpBuyAccounts {
  const bondingCurve = pda(PUMP_PROGRAM, "bonding-curve", key(mint));
  return {
    global: pda(PUMP_PROGRAM, "global"),
    bondingCurve,
    associatedBondingCurve: associatedTokenAddress(bondingCurve, mint),
    associatedUser: associatedTokenAddress(trader, mint),
    creatorVault: pda(PUMP_PROGRAM, "creator-vault", key(trader)),
    eventAuthority: pda(PUMP_PROGRAM, "__event_authority"),
    globalVolumeAccumulator: pda(PUMP_PROGRAM, "global_volume_accumulator"),
    userVolumeAccumulator: pda(PUMP_PROGRAM, "user_volume_accumulator", key(trader)),
    feeConfig: pda(PUMP_FEE_PROGRAM, "fee_config", key(PUMP_PROGRAM)),
    bondingCurveV2: pda(PUMP_PROGRAM, "bonding-curve-v2", key(mint)),
  };
}

// The first of `choices` that is already in one of the transaction's lookup tables (it then costs 1 byte, not 32),
// else the first choice.
export const pickRecipient = (choices: string[], inTables: string[]): string => choices.find((c) => inTables.includes(c)) ?? choices[0];

export interface DevBuy {
  trader: string;
  mint: string;
  lamports: bigint; // spendable_sol_in: exactly what the buy spends, pump.fun fees included
  feeRecipient: string; // one of FEE_RECIPIENTS
  buybackFeeRecipient: string; // one of BUYBACK_FEE_RECIPIENTS
}

// [createIdempotent of the trader's token account, buy_exact_sol_in]. min_tokens_out is 1: the curve is brand new in
// this same transaction, so the price can't move against the trader before the buy.
export function devBuyInstructions(b: DevBuy): NewInstruction[] {
  if (b.lamports <= 0n) throw new Error("The dev buy must be positive.");
  if (b.lamports >= 2n ** 64n) throw new Error("The dev buy amount is out of range.");
  if (!FEE_RECIPIENTS.includes(b.feeRecipient)) throw new Error("Unknown pump.fun fee recipient.");
  if (!BUYBACK_FEE_RECIPIENTS.includes(b.buybackFeeRecipient)) throw new Error("Unknown pump.fun buyback fee recipient.");
  const a = pumpBuyAccounts(b.mint, b.trader);
  const ro = (pubkey: string) => ({ pubkey, signer: false, writable: false });
  const w = (pubkey: string) => ({ pubkey, signer: false, writable: true });
  const trader = { pubkey: b.trader, signer: true, writable: true };
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  data.set(BUY_EXACT_SOL_IN, 0);
  view.setBigUint64(8, b.lamports, true); // spendable_sol_in
  view.setBigUint64(16, 1n, true); // min_tokens_out
  data[24] = 1; // track_volume: OptionBool(true), as pump.fun's SDK sends
  data[25] = 0; // partial_fill: OptionBool(false)
  return [
    {
      programId: ASSOCIATED_TOKEN_PROGRAM,
      accounts: [trader, w(a.associatedUser), ro(b.trader), ro(b.mint), ro(SYSTEM_PROGRAM), ro(TOKEN_2022_PROGRAM)],
      data: new Uint8Array([1]), // CreateIdempotent
    },
    {
      programId: PUMP_PROGRAM,
      accounts: [
        ro(a.global), w(b.feeRecipient), ro(b.mint), w(a.bondingCurve), w(a.associatedBondingCurve), w(a.associatedUser), trader,
        ro(SYSTEM_PROGRAM), ro(TOKEN_2022_PROGRAM), w(a.creatorVault), ro(a.eventAuthority), ro(PUMP_PROGRAM),
        ro(a.globalVolumeAccumulator), w(a.userVolumeAccumulator), ro(a.feeConfig), ro(PUMP_FEE_PROGRAM),
        ro(a.bondingCurveV2), w(b.buybackFeeRecipient),
      ],
      data,
    },
  ];
}

export interface LaunchParts {
  trader: string;
  mint: string;
  devBuyLamports: bigint; // 0 = no dev buy
  treasury: string;
  launchFeeLamports: bigint; // 0 = no launch fee
}

// The whole unsigned launch transaction: PumpPortal's create-only transaction (already passed checkCreateTx), then
// SpookPad's dev buy when there is one, then the launch fee when there is one. Throws when it can't be built or would
// be over 1232 bytes. Also throws unless the trader pays for the transaction and its one pump.fun create is a create_v2
// of `p.mint` (checkCreateTx guarantees this; it is re-checked here because the buy is built from `p`, not from the create).
export function buildLaunchTx(created: DecodedTx, tables: LookupTables, p: LaunchParts): Uint8Array {
  if (p.trader !== created.staticKeys[0]) throw new Error("The trader must pay for the launch transaction.");
  const creates = created.instructions.filter((ix) => programOf(created, ix) === PUMP_PROGRAM && isCreateData(ix.data));
  if (creates.length !== 1 || decodeCreateArgs(creates[0].data).version !== 2) throw new Error("The launch transaction must hold exactly one pump.fun create_v2.");
  const createIx = creates[0];
  if (accountOf(created, createIx, 0) !== p.mint) throw new Error("The launch transaction creates a different mint.");
  const added: NewInstruction[] = [];
  if (p.devBuyLamports > 0n) {
    const inTables = Object.values(tables).flat();
    added.push(...devBuyInstructions({
      trader: p.trader, mint: p.mint, lamports: p.devBuyLamports,
      feeRecipient: pickRecipient(FEE_RECIPIENTS, inTables), buybackFeeRecipient: pickRecipient(BUYBACK_FEE_RECIPIENTS, inTables),
    }));
  }
  if (p.launchFeeLamports > 0n) added.push(transferInstruction(p.trader, p.treasury, p.launchFeeLamports));
  return appendInstructions(created, tables, added);
}
