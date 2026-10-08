// Launching (spec §2 step 5): the browser makes the coin's mint keypair, prepare-launch returns the unsigned pump.fun
// create transaction (with the launch fee added), the wallet signs it first, then the mint keypair signs, the browser
// sends it, and confirm-launch lists the coin once Solana confirms it.
// Every call makes its own mint keypair and uses only the transaction it prepared: a re-prepare abandons the earlier
// pending launch on the server, so an older prepared transaction is never reused or sent.
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { fromBase64 } from "@spookpad/core/encoding";
import type { CoinFields } from "@spookpad/core/validate";
import type { Invoke } from "./call";

export type LaunchStep = "preparing" | "signing" | "sending" | "confirming";
export interface LaunchDeps {
  invoke: Invoke;
  signWithWallet(tx: VersionedTransaction): Promise<VersionedTransaction>;
  send(raw: Uint8Array): Promise<string>;
  wait(ms: number): Promise<void>;
  onStep?(s: LaunchStep): void;
  onSent?(mint: string, signature: string): void; // so an unconfirmed launch can be checked again, not redone
}

const POLL_MS = 2000;
const POLL_TRIES = 45;

export async function launchCoin(d: LaunchDeps, p: { generationId: string; fields: CoinFields; devBuyLamports: number }): Promise<string> {
  const mint = Keypair.generate();
  const address = mint.publicKey.toBase58();
  d.onStep?.("preparing");
  const prep = await d.invoke<{ transaction: string }>("prepare-launch", {
    generation_id: p.generationId, mint: address, ...p.fields, dev_buy_lamports: p.devBuyLamports,
  });
  d.onStep?.("signing");
  const signed = await d.signWithWallet(VersionedTransaction.deserialize(fromBase64(prep.transaction))); // the wallet signs first
  signed.sign([mint]);
  d.onStep?.("sending");
  const signature = await d.send(signed.serialize());
  d.onSent?.(address, signature);
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
  throw new Error(`Your coin was sent but hasn't confirmed yet. It shows in the Graveyard once it does. Coin address: ${address}`);
}
