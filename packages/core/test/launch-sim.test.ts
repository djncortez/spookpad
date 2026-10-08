// Simulates the whole launch transaction (PumpPortal's create + SpookPad's dev buy + launch fee) on mainnet, without
// signatures. Opt-in, it needs the network:  SIMULATE=1 npx vitest run packages/core/test/launch-sim.test.ts
import { describe, expect, test } from "vitest";
import { Keypair } from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { fromBase64, toBase64 } from "../src/encoding";
import { buildLaunchTx } from "../src/pump-buy";
import { decodeTransaction, type LookupTables } from "../src/solana-tx";

const FIXTURE = "packages/core/test/fixtures/pumpportal/launch.json";
const RPC = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

describe("launch simulation on mainnet", () => {
  test.skipIf(!process.env.SIMULATE || !existsSync(FIXTURE))("create + 0.01 SOL dev buy + launch fee simulates with no error", async () => {
    const f = JSON.parse(readFileSync(FIXTURE, "utf8")) as { creator: string; mint: string; tx: string; tables: LookupTables };
    const bytes = buildLaunchTx(decodeTransaction(fromBase64(f.tx)), f.tables,
      { trader: f.creator, mint: f.mint, devBuyLamports: 10_000_000n, treasury: Keypair.generate().publicKey.toBase58(), launchFeeLamports: 20_000_000n });
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "simulateTransaction", params: [toBase64(bytes),
        { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" }] }),
    });
    const { result, error } = await res.json() as { result?: { value: { err: unknown; logs: string[] | null; unitsConsumed?: number } }; error?: unknown };
    if (error || result?.value.err !== null) console.log(JSON.stringify(error ?? result?.value, null, 2));
    expect(error).toBeUndefined();
    expect(result!.value.err).toBeNull();
    expect(result!.value.logs).toContain("Program log: Instruction: BuyExactSolIn");
  }, 60_000);
});
