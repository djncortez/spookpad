// POST /functions/v1/confirm-launch  (Authorization: Bearer <Supabase access token>)  (spec §4.3)
//   { mint, signature } -> 200 { status: "live" } | 202 { status: "waiting" } (not on Solana yet: ask again in 2 s)
// The transaction must be the one prepare-launch built: this mint, SpookPad's metadata URI, the launch fee paid.
import { SOLANA_ADDRESS } from "@spookpad/core/admin-auth";
import type { ParsedTransaction } from "@spookpad/core/fee-check";
import { checkLaunchTx } from "@spookpad/core/launch-check";
import type { Rpc } from "@spookpad/core/rpc-types";
import { StoreError } from "./errors";
import { bearer, corsHeaders, json } from "./http";
import type { LaunchRow } from "./store";

export interface ConfirmLaunchDeps {
  origins: string[];
  treasury: string;
  walletFromToken(token: string): Promise<string | null>;
  loadLaunch(mint: string): Promise<LaunchRow | null>;
  rpc: Rpc;
  confirmLaunch(mint: string, wallet: string, signature: string): Promise<LaunchRow>;
}

const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export function createConfirmLaunchHandler(d: ConfirmLaunchDeps) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, d.origins);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
    const fail = (status: number, error: string) => json({ error }, status, cors);
    const live = () => json({ status: "live" }, 200, cors);
    try {
      const token = bearer(req);
      let wallet: string | null = null;
      if (token) {
        try {
          wallet = await d.walletFromToken(token);
        } catch (e) {
          console.error("confirm-launch: couldn't check the sign-in", e);
          return fail(502, "Couldn't check your sign-in right now. Try again in a minute.");
        }
      }
      if (!wallet) return fail(401, "Sign in with your wallet first.");

      const body = (await req.json().catch(() => null)) as { mint?: unknown; signature?: unknown } | null;
      const mint = typeof body?.mint === "string" && SOLANA_ADDRESS.test(body.mint) ? body.mint : null;
      const signature = typeof body?.signature === "string" && SIGNATURE.test(body.signature) ? body.signature : null;
      if (!mint || !signature) return fail(400, "That isn't a Solana launch.");
      const l = await d.loadLaunch(mint);
      if (!l || l.wallet !== wallet) return fail(404, "Launch not found.");
      if (l.state === "live") return live();

      let tx: ParsedTransaction | null;
      try {
        tx = await d.rpc<ParsedTransaction | null>("getTransaction", [
          signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
        ]);
      } catch (e) {
        console.error("confirm-launch: RPC failed", e);
        return fail(502, "Couldn't read the launch from Solana right now. Try again in a minute.");
      }
      if (!tx) return json({ status: "waiting" }, 202, cors);
      const problem = checkLaunchTx(tx, {
        wallet, mint, treasury: d.treasury, launchFeeLamports: l.launch_fee_lamports, name: l.name, symbol: l.ticker, uri: l.metadata_uri,
      });
      if (problem) return fail(400, problem);
      await d.confirmLaunch(mint, wallet, signature);
      return live();
    } catch (e) {
      if (e instanceof StoreError && e.code === "already_launched") return fail(409, "This costume already launched a coin.");
      if (e instanceof StoreError && e.code === "signature_used") return fail(409, "That transaction already confirmed another launch.");
      if (e instanceof StoreError && e.code === "not_found") return fail(404, "Launch not found.");
      console.error("confirm-launch failed", e);
      return fail(500, "Something went wrong. Try again in a minute.");
    }
  };
}
