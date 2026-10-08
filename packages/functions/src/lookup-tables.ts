// Reads the address-lookup tables a PumpPortal transaction uses (one getMultipleAccounts call), so prepare-launch can add
// SpookPad's dev buy and launch fee without listing an account twice (spec §4.2 step 4).
import { fromBase64 } from "@spookpad/core/encoding";
import type { Rpc } from "@spookpad/core/rpc-types";
import { tableAddresses, type LookupTables } from "@spookpad/core/solana-tx";

export const LOOKUP_TABLE_PROGRAM = "AddressLookupTab1e1111111111111111111111111";

export function lookupTableReader(rpc: Rpc) {
  return async (addresses: string[]): Promise<LookupTables> => {
    if (!addresses.length) return {};
    const res = await rpc<{ value: ({ owner: string; data: [string, string] } | null)[] }>(
      "getMultipleAccounts", [addresses, { encoding: "base64", commitment: "confirmed" }],
    );
    const tables: LookupTables = {};
    addresses.forEach((address, i) => {
      const account = res.value[i];
      if (!account) throw new Error(`Lookup table ${address} not found.`);
      if (account.owner !== LOOKUP_TABLE_PROGRAM) throw new Error(`${address} isn't a lookup table.`);
      tables[address] = tableAddresses(fromBase64(account.data[0]));
    });
    return tables;
  };
}
