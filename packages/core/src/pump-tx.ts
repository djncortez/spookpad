// Checks the unsigned create-only transaction PumpPortal builds before SpookPad adds its own dev buy and fee and hands
// it to the trader (spec §4.2 step 4): it creates exactly this coin (mint, name, ticker, SpookPad's metadata URI) with
// the trader as creator and fee payer, creator fees to the trader, no SOL transfers, and nothing else. PumpPortal is never asked for a
// dev buy: it routes buys through its own program (FAdo9NCw…, seen live on 2026-10-08), which the trader's wallet
// must not sign for. Layouts from pump-fun/pump-public-docs idl/pump.json (create/create_v2 checked by IdeaPad on
// 2026-09-29 and against a live PumpPortal transaction on 2026-10-08).
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { utf8 } from "./encoding";
import { accountOf, programOf, SYSTEM_PROGRAM, type DecodedTx } from "./solana-tx";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const anchor = (name: string): number[] => Array.from(sha256(utf8(`global:${name}`)).slice(0, 8));
export const CREATE_V1 = anchor("create");
export const CREATE_V2 = anchor("create_v2");
export const BUY = anchor("buy");
export const BUY_EXACT_SOL_IN = anchor("buy_exact_sol_in");
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const ALLOWED_PROGRAMS = new Set([PUMP_PROGRAM, COMPUTE_BUDGET, SYSTEM_PROGRAM]);
// SOL that PumpPortal's own transaction may move with plain System transfers: none. SpookPad asks PumpPortal for the
// create only (amount 0) and the live transaction has no transfer; a transfer's destination couldn't be pinned anyway.
// If PumpPortal starts adding a service-fee transfer, every launch is refused here until that is reviewed.
export const MAX_EXTRA_TRANSFER_LAMPORTS = 0n;
// Priority fee = compute unit limit x unit price. The live PumpPortal create pays 0.0005 SOL; refuse anything above 0.005 SOL.
export const MAX_PRIORITY_FEE_LAMPORTS = 5_000_000n;

export interface CreateArgs {
  version: 1 | 2;
  name: string;
  symbol: string;
  uri: string;
  creator: string;
  mayhem: boolean;
  cashback: boolean;
  creatorFeeBps: bigint;
  holderReward: boolean;
}

export interface ExpectedCreate {
  creator: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
}

const same = (data: Uint8Array, disc: number[]) => data.length >= 8 && disc.every((b, i) => data[i] === b);

// Decodes create / create_v2 arguments. Trailing optional flags may be missing (older builders): missing = off.
export function decodeCreateArgs(data: Uint8Array): CreateArgs {
  const version = same(data, CREATE_V2) ? 2 : same(data, CREATE_V1) ? 1 : 0;
  if (!version) throw new Error("Not a pump.fun create instruction.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 8;
  const need = (n: number) => { if (pos + n > data.length) throw new Error("Create instruction is cut short."); };
  const str = () => {
    need(4);
    const len = view.getUint32(pos, true);
    pos += 4;
    need(len);
    let s: string;
    try { s = new TextDecoder("utf-8", { fatal: true }).decode(data.slice(pos, pos + len)); } catch { throw new Error("Create instruction has text that isn't valid."); }
    pos += len;
    return s;
  };
  const name = str(), symbol = str(), uri = str();
  need(32);
  const creator = bs58.encode(data.slice(pos, pos + 32));
  pos += 32;
  const flag = () => { if (pos >= data.length) return false; const b = data[pos++]; if (b > 1) throw new Error("Bad flag in create instruction."); return b === 1; };
  const u64 = () => { if (pos >= data.length) return 0n; need(8); const v = view.getBigUint64(pos, true); pos += 8; return v; };
  if (version === 1) {
    if (pos !== data.length) throw new Error("Unexpected data in create instruction.");
    return { version: 1, name, symbol, uri, creator, mayhem: false, cashback: false, creatorFeeBps: 0n, holderReward: false };
  }
  const mayhem = flag(), cashback = flag(), creatorFeeBps = u64(), holderReward = flag();
  if (pos !== data.length) throw new Error("Unexpected data in create instruction.");
  return { version: 2, name, symbol, uri, creator, mayhem, cashback, creatorFeeBps, holderReward };
}

export const isCreateData = (data: Uint8Array): boolean => same(data, CREATE_V1) || same(data, CREATE_V2);

export function checkCreateTx(tx: DecodedTx, want: ExpectedCreate):
  { ok: true; args: CreateArgs } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const signers = tx.staticKeys.slice(0, tx.header.requiredSignatures);
  if (tx.staticKeys[0] !== want.creator) return fail("Your wallet must pay for the launch transaction.");
  if (signers.some((s) => s !== want.creator && s !== want.mint)) return fail("The transaction asks for an unexpected signer.");

  let create: CreateArgs | null = null;
  let extra = 0n;
  let limit: bigint | null = null; // SetComputeUnitLimit units
  let price: bigint | null = null; // SetComputeUnitPrice micro-lamports per unit
  for (const ix of tx.instructions) {
    const program = programOf(tx, ix);
    if (!ALLOWED_PROGRAMS.has(program)) return fail(`The transaction calls an unexpected program (${program}).`);
    if (program === COMPUTE_BUDGET) {
      // only SetComputeUnitLimit (2, u32) and SetComputeUnitPrice (3, u64), each once, with exact lengths
      const bad = fail("The transaction has an unexpected compute-budget instruction.");
      const d = ix.data;
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (d[0] === 2 && d.length === 5 && limit === null) limit = BigInt(dv.getUint32(1, true));
      else if (d[0] === 3 && d.length === 9 && price === null) price = dv.getBigUint64(1, true);
      else return bad;
      continue;
    }
    if (program === SYSTEM_PROGRAM) {
      const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
      if (ix.data.length !== 12 || view.getUint32(0, true) !== 2) return fail("The transaction has an unexpected system instruction.");
      if (accountOf(tx, ix, 0) !== want.creator) return fail("The transaction moves SOL from an unexpected wallet.");
      extra += view.getBigUint64(4, true);
      continue;
    }
    if (isCreateData(ix.data)) {
      if (create) return fail("The transaction creates more than one coin.");
      let args: CreateArgs;
      try { args = decodeCreateArgs(ix.data); } catch (e) { return fail((e as Error).message); }
      if (args.version !== 2) return fail("This is an old-style create; SpookPad needs create_v2.");
      if (accountOf(tx, ix, 0) !== want.mint) return fail("The transaction creates a different mint.");
      if (accountOf(tx, ix, 5) !== want.creator) return fail("The transaction's creating wallet isn't yours.");
      create = args;
      continue;
    }
    if (same(ix.data, BUY) || same(ix.data, BUY_EXACT_SOL_IN)) return fail("PumpPortal added a dev buy; SpookPad adds its own.");
    return fail("The transaction does another pump.fun action.");
  }
  if (!create) return fail("The transaction doesn't create a coin.");
  // buildLaunchTx appends instructions, so without a limit the fee couldn't be bounded: a price needs a limit.
  if (price !== null) {
    if (limit === null) return fail("The transaction sets a priority fee without a compute-unit limit.");
    if ((limit * price + 999_999n) / 1_000_000n > MAX_PRIORITY_FEE_LAMPORTS) return fail("The transaction's network fee is too high.");
  }
  if (create.name !== want.name || create.symbol !== want.symbol) return fail("The coin name or ticker doesn't match.");
  if (create.uri !== want.uri) return fail("The coin's metadata isn't SpookPad's.");
  if (create.creator !== want.creator) return fail("The creator fees would go to another wallet.");
  if (create.holderReward) return fail("Holder rewards are on: the creator fees would go to holders.");
  if (create.cashback) return fail("Cashback mode is on.");
  if (create.mayhem) return fail("Mayhem mode is on.");
  if (create.creatorFeeBps !== 0n) return fail("The transaction overrides the creator fee.");
  if (extra > MAX_EXTRA_TRANSFER_LAMPORTS) return fail("The transaction sends SOL to another wallet.");
  return { ok: true, args: create };
}
