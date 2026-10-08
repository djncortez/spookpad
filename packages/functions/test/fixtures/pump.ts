// A PumpPortal-shaped unsigned create-only transaction (create_v2), without lookup tables. It uses the real pump.fun
// addresses (bonding curve, global, programs...) that SpookPad's own dev buy reuses, so the full launch fits like a
// real one; the rest are throwaway keys.
import bs58 from "bs58";
import { newKeypair } from "@spookpad/core/keys";
import { ASSOCIATED_TOKEN_PROGRAM, pumpBuyAccounts, TOKEN_2022_PROGRAM } from "@spookpad/core/pump-buy";
import { CREATE_V2, PUMP_PROGRAM } from "@spookpad/core/pump-tx";
import { encodeMessage, serialize, SYSTEM_PROGRAM } from "@spookpad/core/solana-tx";

const str = (s: string) => { const b = new TextEncoder().encode(s); const out = new Uint8Array(4 + b.length); new DataView(out.buffer).setUint32(0, b.length, true); out.set(b, 4); return [...out]; };
const u64 = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return [...b]; };

export function fakeCreateTx(p: { creator: string; mint: string; name: string; symbol: string; uri: string }): Uint8Array {
  const a = pumpBuyAccounts(p.mint, p.creator);
  const [mintAuthority, mayhem, globalParams, solVault, mayhemState, mayhemVault] = Array.from({ length: 6 }, () => newKeypair().publicKey);
  // [writable signers][writable non-signers][read-only non-signers], as create_v2 needs them
  const keys = [p.creator, p.mint, a.bondingCurve, a.associatedBondingCurve, mayhem, solVault, mayhemState, mayhemVault,
    mintAuthority, a.global, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, ASSOCIATED_TOKEN_PROGRAM, globalParams, a.eventAuthority, PUMP_PROGRAM];
  const at = (k: string) => keys.indexOf(k);
  const createAccounts = [p.mint, mintAuthority, a.bondingCurve, a.associatedBondingCurve, a.global, p.creator, SYSTEM_PROGRAM,
    TOKEN_2022_PROGRAM, ASSOCIATED_TOKEN_PROGRAM, mayhem, globalParams, solVault, mayhemState, mayhemVault, a.eventAuthority, PUMP_PROGRAM].map(at);
  const message = encodeMessage({
    version: 0, header: { requiredSignatures: 2, readonlySigned: 0, readonlyUnsigned: 8 }, staticKeys: keys,
    recentBlockhash: bs58.encode(new Uint8Array(32).fill(9)),
    instructions: [{ programIndex: at(PUMP_PROGRAM), accounts: createAccounts,
      data: new Uint8Array([...CREATE_V2, ...str(p.name), ...str(p.symbol), ...str(p.uri), ...bs58.decode(p.creator), 0, 0, ...u64(0n), 0]) }],
  });
  return serialize([new Uint8Array(64), new Uint8Array(64)], message);
}
