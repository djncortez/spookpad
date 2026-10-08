import { describe, expect, test } from "vitest";
import bs58 from "bs58";
import { toBase64 } from "@spookpad/core/encoding";
import { newKeypair } from "@spookpad/core/keys";
import type { Rpc } from "@spookpad/core/rpc-types";
import { LOOKUP_TABLE_PROGRAM, lookupTableReader } from "../src/lookup-tables";

const A = newKeypair().publicKey;
const B = newKeypair().publicKey;
const TABLE = newKeypair().publicKey;
const tableData = (addresses: string[], deactivation = 2n ** 64n - 1n) => {
  const data = new Uint8Array(56 + 32 * addresses.length);
  const view = new DataView(data.buffer);
  view.setUint32(0, 1, true);
  view.setBigUint64(4, deactivation, true);
  addresses.forEach((a, i) => data.set(bs58.decode(a), 56 + 32 * i));
  return [toBase64(data), "base64"];
};
const rpcAnswering = (value: unknown[], calls: unknown[][] = []): Rpc =>
  (async (method: string, params: unknown[]) => { calls.push([method, params]); return { value }; }) as Rpc;

describe("lookupTableReader", () => {
  test("reads every table's addresses in one call", async () => {
    const calls: unknown[][] = [];
    const read = lookupTableReader(rpcAnswering([{ owner: LOOKUP_TABLE_PROGRAM, data: tableData([A, B]) }], calls));
    expect(await read([TABLE])).toEqual({ [TABLE]: [A, B] });
    expect(calls).toEqual([["getMultipleAccounts", [[TABLE], { encoding: "base64", commitment: "confirmed" }]]]);
  });
  test("no tables, no call", async () => {
    const calls: unknown[][] = [];
    expect(await lookupTableReader(rpcAnswering([], calls))([])).toEqual({});
    expect(calls).toEqual([]);
  });
  test("refuses a missing account, another owner's account and a table being closed", async () => {
    await expect(lookupTableReader(rpcAnswering([null]))([TABLE])).rejects.toThrow(/not found/);
    await expect(lookupTableReader(rpcAnswering([{ owner: A, data: tableData([A]) }]))([TABLE])).rejects.toThrow(/isn't a lookup table/);
    await expect(lookupTableReader(rpcAnswering([{ owner: LOOKUP_TABLE_PROGRAM, data: tableData([A], 5n) }]))([TABLE])).rejects.toThrow(/closed/);
  });
});
