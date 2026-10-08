// Asks PumpPortal for a real, unsigned create-only transaction (SpookPad never asks PumpPortal for a dev buy), reads
// the address-lookup tables it uses from public mainnet RPC, and saves both as a test fixture, so the tests check
// SpookPad's rules and its own dev buy against what PumpPortal really builds. Nothing is signed or sent.
// The creator is a public, well-funded mainnet wallet (never signs anything here) so the launch simulation
// (launch-sim.test.ts) has a payer with SOL; the mint is a fresh throwaway key. Run again whenever PumpPortal changes:
//   node scripts/capture-pumpportal.mjs
import { Keypair, PublicKey } from "@solana/web3.js";
import { mkdirSync, writeFileSync } from "node:fs";

const RPC = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
const CREATOR = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"; // a public exchange hot wallet holding millions of SOL
const dir = "packages/core/test/fixtures/pumpportal";
mkdirSync(dir, { recursive: true });

const mint = Keypair.generate().publicKey.toBase58();
const meta = { name: "Spook Test", symbol: "SPOOK", uri: "https://ipfs.io/ipfs/QmSpookPadTestFixture" };
const res = await fetch("https://pumpportal.fun/api/trade-local", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ publicKey: CREATOR, action: "create", tokenMetadata: meta, mint, denominatedInSol: "true",
    amount: 0, slippage: 10, priorityFee: 0.0005, pool: "pump" }),
});
if (res.status !== 200) throw new Error(`PumpPortal HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
const bytes = new Uint8Array(await res.arrayBuffer());

// the v0 lookup section is the tail of the message; web3.js reads it for us here (the script is plain JS)
const { VersionedTransaction } = await import("@solana/web3.js");
const lookups = VersionedTransaction.deserialize(bytes).message.addressTableLookups.map((l) => l.accountKey.toBase58());
const tables = {};
if (lookups.length) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [lookups, { encoding: "base64" }] }),
  });
  const { result, error } = await r.json();
  if (error || !result) throw new Error(`RPC: ${JSON.stringify(error)}`);
  lookups.forEach((table, i) => {
    if (!result.value[i]) throw new Error(`Lookup table ${table} not found.`);
    const data = Buffer.from(result.value[i].data[0], "base64");
    tables[table] = Array.from({ length: (data.length - 56) / 32 }, (_, j) => new PublicKey(data.subarray(56 + 32 * j, 88 + 32 * j)).toBase58());
  });
}
writeFileSync(`${dir}/launch.json`, JSON.stringify({ creator: CREATOR, mint, ...meta, tx: Buffer.from(bytes).toString("base64"), tables }, null, 2) + "\n");
console.log(`saved ${dir}/launch.json (${bytes.length} bytes, ${lookups.length} lookup table(s))`);
