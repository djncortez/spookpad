// Launching (spec §2 step 5): the browser makes the coin's mint keypair, prepare-launch returns the unsigned pump.fun
// create transaction (with the launch fee added), the wallet signs it first, then the mint keypair signs, the browser
// sends it, and confirm-launch lists the coin once Solana confirms it.
// Every call makes its own mint keypair and uses only the transaction it prepared: a re-prepare abandons the earlier
// pending launch on the server, so an older prepared transaction is never reused or sent.
import { Keypair, SystemProgram, VersionedTransaction, type AddressLookupTableAccount, type PublicKey } from "@solana/web3.js";
import { fromBase64 } from "@spookpad/core/encoding";
import { associatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from "@spookpad/core/pump-buy";
import { BUY_EXACT_SOL_IN, COMPUTE_BUDGET_PROGRAM, CREATE_V2, priorityFeeOf, PUMP_PROGRAM } from "@spookpad/core/pump-tx";
import type { CoinFields } from "@spookpad/core/validate";
import bs58 from "bs58";
import type { Invoke } from "./call";
import { StillWaiting, type Expiry } from "./pending";

export type LaunchStep = "preparing" | "signing" | "sending" | "confirming";
export interface LaunchDeps {
  invoke: Invoke;
  lookupTable(address: PublicKey): Promise<AddressLookupTableAccount | null>; // to read accounts the transaction loads from tables
  signWithWallet(tx: VersionedTransaction): Promise<VersionedTransaction>;
  send(raw: Uint8Array): Promise<string>;
  wait(ms: number): Promise<void>;
  onStep?(s: LaunchStep): void;
  onSent?(mint: string, signature: string, expiry: Expiry): void; // called BEFORE send, so an unconfirmed launch can be checked again, not redone
}

const POLL_MS = 2000;
const POLL_TRIES = 45;

// What the trader was shown: their wallet, SpookPad's treasury (NEXT_PUBLIC_TREASURY_ADDRESS), the launch fee, the dev buy.
export interface LaunchExpect {
  trader: string;
  mint: string; // the coin's mint, made in the browser
  treasury: string;
  launchFeeLamports: number;
  devBuyLamports: number;
}

const u64At = (data: Uint8Array, at: number): bigint => new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(at, true);
const startsWith = (data: Uint8Array, prefix: number[]) => data.length >= prefix.length && prefix.every((b, i) => data[i] === b);

// Checks the prepared transaction before the wallet is asked to sign it: the trader pays for it; it calls only
// pump.fun, System, ComputeBudget and Associated Token; its only System instructions are transfers from the trader to
// the configured treasury adding up to exactly the launch fee shown; pump.fun gets exactly one create_v2 and, only when
// the dev buy shown is above 0, one buy_exact_sol_in spending exactly that; the priority fee passes the same check as
// the server's (priorityFeeOf, capped at MAX_PRIORITY_FEE_LAMPORTS); Associated Token only createIdempotent, at most once, only with a dev buy, for the trader's own Token-2022 account for this mint; the dev buy must be for this mint and trader. Accounts
// loaded from lookup tables are resolved, so a fee or a treasury loaded from a table is checked too. Returns a problem,
// or null.
export async function checkPreparedLaunch(tx: VersionedTransaction, want: LaunchExpect, lookupTable: LaunchDeps["lookupTable"]): Promise<string | null> {
  if (!want.treasury) return "SpookPad's treasury address isn't set up on this site.";
  const msg = tx.message;
  if (msg.staticAccountKeys[0]?.toBase58() !== want.trader) return "your wallet doesn't pay for it.";
  const tables: AddressLookupTableAccount[] = [];
  for (const l of msg.addressTableLookups) {
    const table = await lookupTable(l.accountKey);
    if (!table) return "one of its address tables couldn't be read.";
    tables.push(table);
  }
  let keys;
  try { keys = msg.getAccountKeys({ addressLookupTableAccounts: tables }); } catch { return "its accounts couldn't be read."; }
  const key = (i: number) => keys.get(i)?.toBase58();
  let toTreasury = 0n;
  let creates = 0;
  let atas = 0;
  const buys: bigint[] = [];
  const budget: Uint8Array[] = [];
  for (const ix of msg.compiledInstructions) {
    const program = key(ix.programIdIndex);
    const data = ix.data;
    if (program === SystemProgram.programId.toBase58()) {
      if (data.length !== 12 || new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true) !== 2) return "it has an unexpected System instruction.";
      if (key(ix.accountKeyIndexes[0]) !== want.trader || key(ix.accountKeyIndexes[1]) !== want.treasury) return "it sends SOL to a wallet that isn't SpookPad's treasury.";
      toTreasury += u64At(data, 4);
    } else if (program === PUMP_PROGRAM) {
      if (startsWith(data, CREATE_V2)) creates++;
      else if (startsWith(data, BUY_EXACT_SOL_IN)) {
        if (data.length < 16) return "its dev buy can't be read.";
        if (key(ix.accountKeyIndexes[2]) !== want.mint || key(ix.accountKeyIndexes[6]) !== want.trader) return "its dev buy is for a different coin or wallet.";
        buys.push(u64At(data, 8));
      } else return "it has an unexpected pump.fun instruction.";
    } else if (program === COMPUTE_BUDGET_PROGRAM) {
      budget.push(data);
    } else if (program === ASSOCIATED_TOKEN_PROGRAM) {
      if (data.length !== 1 || data[0] !== 1) return "it has an unexpected token-account instruction.";
      // The only one allowed is the trader's own Token-2022 account for this coin, made for the dev buy.
      const a = ix.accountKeyIndexes.map(key);
      const mine = a.length === 6 && a[0] === want.trader && a[1] === associatedTokenAddress(want.trader, want.mint) && a[2] === want.trader
        && a[3] === want.mint && a[4] === SystemProgram.programId.toBase58() && a[5] === TOKEN_2022_PROGRAM;
      if (++atas > 1 || want.devBuyLamports <= 0 || !mine) return "it creates a token account that isn't yours for this coin.";
    } else {
      return `it calls an unexpected program (${program}).`;
    }
  }
  if (creates !== 1) return "it doesn't create exactly one coin.";
  const fee = priorityFeeOf(budget);
  if (!fee.ok) return fee.problem === "too_high" ? "its network fee is too high." : "it has unexpected network fee settings.";
  if (toTreasury !== BigInt(want.launchFeeLamports)) return "the launch fee isn't the one shown (reload the page to see the current fee).";
  const buyOk = want.devBuyLamports > 0 ? buys.length === 1 && buys[0] === BigInt(want.devBuyLamports) : buys.length === 0;
  if (!buyOk) return "the dev buy isn't the one you entered.";
  return null;
}

export async function launchCoin(d: LaunchDeps, p: { generationId: string; fields: CoinFields; devBuyLamports: number } & Omit<LaunchExpect, "devBuyLamports" | "mint">): Promise<string> {
  const mint = Keypair.generate();
  const address = mint.publicKey.toBase58();
  d.onStep?.("preparing");
  const prep = await d.invoke<{ transaction: string }>("prepare-launch", {
    generation_id: p.generationId, mint: address, ...p.fields, dev_buy_lamports: p.devBuyLamports,
  });
  const prepared = VersionedTransaction.deserialize(fromBase64(prep.transaction));
  const problem = await checkPreparedLaunch(prepared, { trader: p.trader, mint: address, treasury: p.treasury, launchFeeLamports: p.launchFeeLamports, devBuyLamports: p.devBuyLamports }, d.lookupTable);
  if (problem) throw new Error(`The launch transaction didn't match what SpookPad showed: ${problem} Nothing was signed.`);
  d.onStep?.("signing");
  const signed = await d.signWithWallet(prepared); // the wallet signs first
  signed.sign([mint]);
  d.onStep?.("sending");
  // The signature is known from the signed transaction, so it is remembered before the send can reach Solana.
  const signature = bs58.encode(signed.signatures[0]); // the wallet is the fee payer, so its signature is first
  d.onSent?.(address, signature, { blockhash: signed.message.recentBlockhash });
  await d.send(signed.serialize());
  return confirmLaunch(d, address, signature);
}

// After the transaction is sent: wait until Solana shows it; confirm-launch then lists the coin. Safe to call again.
export async function confirmLaunch(d: Pick<LaunchDeps, "invoke" | "wait" | "onStep">, address: string, signature: string): Promise<string> {
  d.onStep?.("confirming");
  for (let i = 0; i < POLL_TRIES; i++) {
    const r = await d.invoke<{ status: "live" | "waiting" }>("confirm-launch", { mint: address, signature });
    if (r.status === "live") return address;
    await d.wait(POLL_MS);
  }
  throw new StillWaiting(`Your coin was sent but hasn't confirmed yet. It shows in the Graveyard once it does. Coin address: ${address}`);
}
