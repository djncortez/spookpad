// Launching (spec §2 step 5): the browser makes the coin's mint keypair, prepare-launch returns the unsigned pump.fun
// create transaction (with the launch fee added), the wallet signs it first, then the mint keypair signs, the browser
// sends it, and confirm-launch lists the coin once Solana confirms it.
// Every call makes its own mint keypair and uses only the transaction it prepared: a re-prepare abandons the earlier
// pending launch on the server, so an older prepared transaction is never reused or sent.
import { Keypair, SystemProgram, VersionedTransaction, type AddressLookupTableAccount, type PublicKey } from "@solana/web3.js";
import { fromBase64 } from "@spookpad/core/encoding";
import { BUY_EXACT_SOL_IN, PUMP_PROGRAM } from "@spookpad/core/pump-tx";
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
  treasury: string;
  launchFeeLamports: number;
  devBuyLamports: number;
}

const u64At = (data: Uint8Array, at: number): bigint => new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(at, true);
const startsWith = (data: Uint8Array, prefix: number[]) => data.length >= prefix.length && prefix.every((b, i) => data[i] === b);

// Checks the prepared transaction before the wallet is asked to sign it: the trader pays for it, its only System
// instructions are transfers from the trader to the configured treasury adding up to exactly the launch fee shown, and
// its pump.fun dev buy (buy_exact_sol_in) spends exactly the dev buy shown (none when it is 0). Accounts loaded from
// lookup tables are resolved, so a fee or a treasury loaded from a table is checked too. Returns a problem, or null.
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
  const buys: bigint[] = [];
  for (const ix of msg.compiledInstructions) {
    const program = key(ix.programIdIndex);
    const data = ix.data;
    if (program === SystemProgram.programId.toBase58()) {
      if (data.length !== 12 || new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true) !== 2) return "it has an unexpected System instruction.";
      if (key(ix.accountKeyIndexes[0]) !== want.trader || key(ix.accountKeyIndexes[1]) !== want.treasury) return "it sends SOL to a wallet that isn't SpookPad's treasury.";
      toTreasury += u64At(data, 4);
    } else if (program === PUMP_PROGRAM && startsWith(data, BUY_EXACT_SOL_IN)) {
      if (data.length < 16) return "its dev buy can't be read.";
      buys.push(u64At(data, 8));
    }
  }
  if (toTreasury !== BigInt(want.launchFeeLamports)) return "the launch fee isn't the one shown (reload the page to see the current fee).";
  const buyOk = want.devBuyLamports > 0 ? buys.length === 1 && buys[0] === BigInt(want.devBuyLamports) : buys.length === 0;
  if (!buyOk) return "the dev buy isn't the one you entered.";
  return null;
}

export async function launchCoin(d: LaunchDeps, p: { generationId: string; fields: CoinFields; devBuyLamports: number } & Omit<LaunchExpect, "devBuyLamports">): Promise<string> {
  const mint = Keypair.generate();
  const address = mint.publicKey.toBase58();
  d.onStep?.("preparing");
  const prep = await d.invoke<{ transaction: string }>("prepare-launch", {
    generation_id: p.generationId, mint: address, ...p.fields, dev_buy_lamports: p.devBuyLamports,
  });
  const prepared = VersionedTransaction.deserialize(fromBase64(prep.transaction));
  const problem = await checkPreparedLaunch(prepared, { trader: p.trader, treasury: p.treasury, launchFeeLamports: p.launchFeeLamports, devBuyLamports: p.devBuyLamports }, d.lookupTable);
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
