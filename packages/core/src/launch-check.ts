// Checks a confirmed launch transaction (spec §4.3): it succeeded, the trader paid and signed it, it created this mint
// with exactly the name, ticker and metadata URI SpookPad prepared (so the coin wears its costume) with the trader as
// creator, and it paid the launch fee. Works on the RPC's jsonParsed getTransaction result.
import bs58 from "bs58";
import { paysAtLeast, type ParsedTransaction } from "./fee-check";
import { decodeCreateArgs, isCreateData, PUMP_PROGRAM, type CreateArgs } from "./pump-tx";

export interface LaunchExpectation {
  wallet: string;
  mint: string;
  treasury: string;
  launchFeeLamports: number;
  name: string;
  symbol: string;
  uri: string;
}

function createArgs(data: string | undefined): CreateArgs | null {
  if (typeof data !== "string") return null;
  try {
    const bytes = bs58.decode(data);
    if (!isCreateData(bytes)) return null;
    const args = decodeCreateArgs(bytes);
    return args.version === 2 ? args : null; // SpookPad launches are Token-2022 only
  } catch {
    return null;
  }
}

export function checkLaunchTx(tx: ParsedTransaction, want: LaunchExpectation): string | null {
  if (!tx.meta || tx.meta.err !== null) return "The launch transaction failed on-chain.";
  const keys = tx.transaction.message.accountKeys;
  if (keys[0]?.pubkey !== want.wallet || !keys[0].signer) return "The launch must come from your signed-in wallet.";
  if (!keys.some((k) => k.pubkey === want.mint && k.signer)) return "That transaction doesn't create this coin.";
  const create = tx.transaction.message.instructions
    .filter((i) => i.programId === PUMP_PROGRAM && i.accounts?.[0] === want.mint)
    .map((i) => createArgs(i.data))
    .find((a) => a !== null);
  if (!create) return "That transaction doesn't create this coin.";
  if (create.name !== want.name || create.symbol !== want.symbol || create.uri !== want.uri || create.creator !== want.wallet) {
    return "That coin isn't the one SpookPad prepared.";
  }
  if (want.launchFeeLamports > 0 && !paysAtLeast(tx, want.wallet, want.treasury, want.launchFeeLamports)) {
    return "That transaction doesn't pay the SpookPad launch fee.";
  }
  return null;
}
