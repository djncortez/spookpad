# SpookPad

**Every coin wears a costume.** Traders launch their own meme coins on pump.fun. Before launch, the coin's mascot is
dressed in a Halloween costume by AI (Google's Nano Banana 2.1 through OpenRouter): a bedsheet ghost by default, or a
witch, vampire, pumpkin head, mummy, skeleton or devil. Traders pay a small SOL fee per costume and a launch fee; both
go to the SpookPad treasury, which pays for the AI.

Design: `docs/superpowers/specs/2026-10-08-spookpad-design.md`. Build plan: `docs/superpowers/plans/2026-10-08-spookpad.md`.

## How the money works

| What | Who pays | Goes to |
|---|---|---|
| Costume fee (default 0.001 SOL per summon) | the trader | the treasury |
| Launch fee (default 0.02 SOL, inside the launch transaction) | the trader | the treasury |
| pump.fun creator fees on trading | traders of the coin | the coin's creator (the trader who launched it) |
| AI costumes (~$0.03 each) | OpenRouter credit | Google, via OpenRouter |

OpenRouter credit is prepaid. Buy it with USDC from your wallet (openrouter.ai -> Settings -> Credits -> crypto; 5% fee).
Start with about $5 (about 150 costumes); after that, swap some treasury SOL to USDC in Phantom and top up. When the
credit drops below the admin page's minimum (default $2), costume summoning pauses itself and the site says
"The cauldron is empty"; top up, then unpause on the admin page.

## Runs on free plans

| Piece | Service |
|---|---|
| Website (static Next.js export) | Netlify |
| Database, wallet sign-in, image storage, server functions | Supabase |
| Solana access | Helius |
| Market caps | The $NOOB live engine: on-chain over Helius (websocket on the coin page, one batched read for the Graveyard); DEX Screener only as fallback |
| Costume AI | OpenRouter (prepaid, paid for by fees) |

A free Supabase project pauses after 7 days without activity; restore it from the Supabase dashboard.

## Layout

| Folder | What |
|---|---|
| `packages/core` | Pure TypeScript rules shared by everything: validation, transaction checks, prompts, settings |
| `packages/functions` | Edge Function handlers (`costume`, `prepare-launch`, `confirm-launch`, `admin`), tested in Node |
| `supabase/migrations` | Schema, SQL functions, RLS lock-down, views |
| `supabase/functions` | Deno entry files + generated `bundle.mjs` |
| `apps/web` | The site; `apps/web/admin/index.html` is the admin page |
| `scripts` | Bundling, the admin page build, the PumpPortal fixture capture |

## Run it locally

```bash
npm install
cp .env.example .env   # fill in the web values and ADMIN_SLUG
npm test               # unit, function and database tests (embedded Postgres)
npm run dev            # http://localhost:3000
```

Try the costumes on your own mascot before going live (uses real OpenRouter credit, about $0.03 each). Type your key
into your own terminal only; never paste it into a chat or commit it:
```bash
OPENROUTER_API_KEY=sk-or-... SAMPLE_IMAGE=./mascot.png npx vitest run packages/functions/test/live-costume.test.ts
# look at .data/costumes/*.png; edit the costume lines on the admin page if one needs tuning
# add COSTUME=ghost to try just one costume
```
In a normal `npm test` this check is skipped and never calls OpenRouter.

## Go live

1. **Supabase.** Create a free project and pick the region **East US (Ohio)** so it sits next to Netlify's functions
   (the region cannot be changed later). Authentication -> Sign In / Providers -> **Web3 Wallet**: enable Solana. Set
   the Site URL to your Netlify URL and add it (and `http://localhost:3000`) to the redirect URLs.
2. **Database.** `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. **Treasury.** Make a separate Phantom wallet for the treasury; copy its address.
4. **OpenRouter.** Create an account, an API key, and buy ~$5 of credit with USDC.
5. **Function secrets.** `npx supabase secrets set NAME=value` for each secret in `.env.example` (HELIUS_API_KEY,
   SITE_ORIGINS, SITE_URL, TREASURY_ADDRESS, OPENROUTER_API_KEY, ADMIN_WALLET, ADMIN_SESSION_SECRET; optional
   OPENROUTER_MODEL, PINATA_JWT, TELEGRAM_BOT_TOKEN, ADMIN_TELEGRAM_CHAT_ID). Run these in your own terminal; never
   paste the values into a chat.
6. **Functions.** `npm run deploy:functions`.
7. **Netlify.** New site from the Git repo; set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   NEXT_PUBLIC_SOLANA_RPC_URL, NEXT_PUBLIC_SITE_URL and ADMIN_SLUG; deploy. The Helius key in
   NEXT_PUBLIC_SOLANA_RPC_URL is visible in every visitor's browser, so in the Helius dashboard lock it to your site's
   domain. Use a separate key for HELIUS_API_KEY on the server.
8. **Admin.** Open `https://<site>/<ADMIN_SLUG>/`, sign in with ADMIN_WALLET, check the fees and the OpenRouter credit.
9. **First real run.** Summon one costume (0.001 SOL) and launch one coin with a 0.01 SOL dev buy (0.02 SOL launch fee,
   the 0.01 SOL buy, plus pump.fun's own creation cost). Check the coin on pump.fun shows the costumed image, that your
   wallet holds the coin, and that the treasury received both fees. Then check the live market cap: on the coin's
   SpookPad page, watch the number for about 30 s next to DEX Screener; it should show LIVE, update on trades and match
   or run ahead of DEX Screener.

## When pump.fun changes

PumpPortal builds only the coin's create transaction. SpookPad builds the dev buy itself (`packages/core/src/pump-buy.ts`) and adds its
own fee. If PumpPortal or pump.fun changes something, `prepare-launch` refuses with "PumpPortal sent a launch
transaction SpookPad won't sign". After any pump.fun upgrade, re-run both of these:

```bash
node scripts/capture-pumpportal.mjs
SIMULATE=1 npx vitest run packages/core/test/launch-sim.test.ts
```

The first re-captures the real PumpPortal transactions; the second simulates a whole launch (create, SpookPad's own dev
buy, fee) on mainnet. Also run `npx vitest run packages/core` to see what changed. If pump.fun changed its buy accounts,
update `packages/core/src/pump-buy.ts` from pump-fun/pump-public-docs.
