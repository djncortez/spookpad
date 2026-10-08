// POST /functions/v1/prepare-launch  (Authorization: Bearer <Supabase access token>)  (spec §4.2)
//   { generation_id, mint, name, ticker, description, twitter, telegram, dev_buy_lamports }
//   -> 200 { transaction, launch_fee_lamports }   transaction: base64, unsigned. The trader's wallet signs it first,
//      then the browser adds the mint keypair's signature and sends it.
// The coin's art is always the generation's stored costume, never the original (spec §1: the costume is mandatory).
// PumpPortal builds the create only; SpookPad adds its own pump.fun dev buy and the launch fee, so the trader's wallet
// only signs pump.fun, System, ComputeBudget and Associated Token instructions.
import { SOLANA_ADDRESS } from "@spookpad/core/admin-auth";
import { toBase64 } from "@spookpad/core/encoding";
import type { Art } from "@spookpad/core/image-type";
import { buildLaunchTx } from "@spookpad/core/pump-buy";
import { checkCreateTx } from "@spookpad/core/pump-tx";
import type { Settings } from "@spookpad/core/settings";
import { decodeTransaction, type DecodedTx, type LookupTables } from "@spookpad/core/solana-tx";
import { checkDevBuy, validateCoinFields } from "@spookpad/core/validate";
import { StoreError } from "./errors";
import { bearer, corsHeaders, json } from "./http";
import type { CoinMetadata } from "./pump-services";
import type { GenerationRow, LaunchRow, NewLaunch } from "./store";

export interface PrepareLaunchDeps {
  origins: string[];
  treasury: string;
  siteUrl: string;
  walletFromToken(token: string): Promise<string | null>;
  loadSettings(): Promise<Settings>;
  loadGeneration(id: string): Promise<GenerationRow | null>;
  downloadArt(path: string): Promise<Art>;
  ipfs(meta: CoinMetadata, art: Art): Promise<string>;
  saveMetadata(generationId: string, key: string, uri: string): Promise<void>;
  createTx(p: { creator: string; mint: string; name: string; symbol: string; uri: string }): Promise<Uint8Array>;
  lookupTables(addresses: string[]): Promise<LookupTables>;
  beginLaunch(l: NewLaunch): Promise<LaunchRow>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_ANSWERS: Record<string, [number, string]> = {
  paused: [409, "Launching is paused right now. Try again soon."],
  not_found: [404, "Costume not found."],
  not_ready: [409, "Summon a costume before launching."],
  already_launched: [409, "This costume already launched a coin. Summon a new one for another coin."],
  mint_used: [409, "That coin address is taken. Press Launch again."],
};

export function createPrepareLaunchHandler(d: PrepareLaunchDeps) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, d.origins);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
    const fail = (status: number, error: string) => json({ error }, status, cors);
    try {
      const token = bearer(req);
      let wallet: string | null = null;
      if (token) {
        try {
          wallet = await d.walletFromToken(token);
        } catch (e) {
          console.error("prepare-launch: couldn't check the sign-in", e);
          return fail(502, "Couldn't check your sign-in right now. Try again in a minute.");
        }
      }
      if (!wallet) return fail(401, "Sign in with your wallet first.");

      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return fail(400, "Send the launch details.");
      const checked = validateCoinFields(body);
      if (!checked.ok) return fail(400, checked.errors.join(" "));
      const f = checked.fields;
      const mint = typeof body.mint === "string" && SOLANA_ADDRESS.test(body.mint) && body.mint !== wallet && body.mint !== d.treasury
        ? body.mint : null;
      if (!mint) return fail(400, "The coin address is missing. Press Launch again.");
      const id = typeof body.generation_id === "string" && UUID.test(body.generation_id) ? body.generation_id : null;
      if (!id) return fail(400, "Pick a costume to launch with.");

      const settings = await d.loadSettings();
      if (settings.launches_paused) return fail(...STORE_ANSWERS.paused);
      const devBuy = body.dev_buy_lamports ?? 0;
      const devBuyProblem = checkDevBuy(devBuy, settings.max_dev_buy_lamports);
      if (devBuyProblem) return fail(400, devBuyProblem);
      const devBuyLamports = devBuy as number;

      const g = await d.loadGeneration(id);
      if (!g || g.wallet !== wallet) return fail(...STORE_ANSWERS.not_found);
      if (g.state !== "ready" || !g.result_path) return fail(...STORE_ANSWERS.not_ready);

      // IPFS once per set of coin fields: launching again after a cancelled wallet prompt reuses it
      const key = JSON.stringify([f.name, f.ticker, f.description, f.twitter, f.telegram]);
      let uri = g.metadata_key === key ? g.metadata_uri : null;
      if (!uri) {
        try {
          const meta: CoinMetadata = { name: f.name, symbol: f.ticker, description: f.description, twitter: f.twitter, telegram: f.telegram, website: d.siteUrl };
          uri = await d.ipfs(meta, await d.downloadArt(g.result_path));
        } catch (e) {
          console.error("prepare-launch: IPFS failed", e);
          return fail(502, "Couldn't upload your coin's art right now. Try again in a minute.");
        }
        await d.saveMetadata(g.id, key, uri);
      }

      let tx: DecodedTx;
      let tables: LookupTables;
      try {
        tx = decodeTransaction(await d.createTx({ creator: wallet, mint, name: f.name, symbol: f.ticker, uri }));
        tables = await d.lookupTables(tx.lookups.map((l) => l.table));
      } catch (e) {
        console.error("prepare-launch: PumpPortal or its lookup tables failed", e);
        return fail(502, "Couldn't build the launch transaction right now. Try again in a minute.");
      }
      const check = checkCreateTx(tx, { creator: wallet, mint, name: f.name, symbol: f.ticker, uri });
      if (!check.ok) {
        console.error("prepare-launch: refused PumpPortal's transaction", check.error);
        return fail(502, `PumpPortal sent a launch transaction SpookPad won't sign: ${check.error} Try again in a minute.`);
      }
      const fee = settings.launch_fee_lamports;
      let out: Uint8Array;
      try {
        // SpookPad's own dev buy (exactly devBuyLamports through pump.fun buy_exact_sol_in) and the launch fee
        out = buildLaunchTx(tx, tables, { trader: wallet, mint, devBuyLamports: BigInt(devBuyLamports), treasury: d.treasury, launchFeeLamports: BigInt(fee) });
      } catch (e) {
        console.error("prepare-launch: couldn't add the dev buy and launch fee", e);
        return fail(502, `Couldn't build the launch transaction: ${(e as Error).message}`);
      }

      await d.beginLaunch({
        mint, wallet, generationId: g.id, name: f.name, ticker: f.ticker, description: f.description, twitter: f.twitter,
        telegram: f.telegram, devBuyLamports, metadataUri: uri, launchFeeLamports: fee,
      });
      return json({ transaction: toBase64(out), launch_fee_lamports: fee }, 200, cors);
    } catch (e) {
      if (e instanceof StoreError && STORE_ANSWERS[e.code]) return fail(...STORE_ANSWERS[e.code]);
      console.error("prepare-launch failed", e);
      return fail(500, "Something went wrong. Try again in a minute.");
    }
  };
}
