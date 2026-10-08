# SpookPad: design

Date: 2026-10-08 · Status: approved in brainstorming, awaiting written review

**A Halloween meme coin launchpad.** Traders launch their own coins on pump.fun. Every coin image is dressed in a
Halloween costume by AI before launch: a bedsheet ghost by default, or a costume the trader picks.

SpookPad reuses IdeaPad's stack and parts (`C:\Users\User\Desktop\IdeaPad`): Next.js static export on Netlify, Supabase
(Postgres, Storage, Edge Functions), Helius, PumpPortal's local-transaction API, pump.fun IPFS, wallet sign-in, and
the admin page at a secret path. Unlike IdeaPad, there are no rounds, votes or platform launch wallet: **the trader is
the coin's creator and signs the launch themselves.**

---

## 1. Decisions

| Topic | Decision | Why |
|---|---|---|
| Launch model | Direct self-launch. Trader signs the pump.fun create transaction from Phantom | Simplest; trader is dev, may dev-buy, receives pump.fun creator fees |
| Costume | Trader picks: Ghost sheet (default), Witch, Vampire, Pumpkin head, Mummy, Skeleton, Devil | Ghost sheet is the brand; choice adds fun |
| Costume is mandatory | The server builds the coin metadata from a costumed image it stored itself | A trader cannot launch the uncostumed original through SpookPad |
| AI model | Google Nano Banana 2.1 (released 2026-10-06, ~$0.034/image) via **OpenRouter** | Best at editing while keeping the character recognizable; OpenRouter credits can be bought with USDC from a wallet (no card) |
| Who pays for AI | The trader pays a **costume fee** in SOL to the treasury per generation | Owner's own funds are never used; fee also stops spam |
| Platform revenue | Flat **launch fee** in SOL to the treasury, inside the launch transaction | One atomic transaction; creator fees stay with the trader |
| Hosting | Free plans only, as IdeaPad; OpenRouter is the only paid service, funded by fees | Owner pays nothing beyond a one-time ~$5 OpenRouter starting balance (USDC from a wallet), repaid by fees; the owner then tops up from the treasury |

## 2. Trader flow

1. **Connect wallet:** Phantom / Solflare through Supabase `signInWithWeb3` (as IdeaPad).
2. **Coin details:** name 1–32 chars; ticker 2–10 chars `A–Z0–9` (stored uppercase); description ≤ 200 chars;
   optional X and Telegram links (https only); image PNG / JPG / WebP (up to 20 MB picked). No GIF: the AI returns a
   still image. The browser crops to square and resizes to 1024×1024 (≤ 3 MB) before upload. The form states the rules: no real people, no
   real brands or trademarks, no targeting private individuals.
3. **Pick a costume** (default Ghost sheet).
4. **"Summon costume":**
   1. Browser uploads the original to `costume` (§4.1) to get a `generation_id` in state `awaiting_payment`.
   2. Phantom signs a transfer of `COSTUME_FEE_LAMPORTS` to `TREASURY_ADDRESS` with a Memo instruction
      `spookpad:<generation_id>`; the browser sends it via Helius and waits for `confirmed`.
   3. Browser calls `costume` with the signature. The server verifies it, calls OpenRouter and stores the result.
   4. The page shows original and costumed image side by side. "Summon again" (same or another costume) starts a new
      paid generation. All of the trader's ready generations for this draft are shown; the trader picks one.
5. **Launch:** optional dev buy (0–`MAX_DEV_BUY_SOL`, default 5 SOL). "Launch" calls `prepare-launch` (§4.2); Phantom
   shows one transaction: pump.fun create (+ SpookPad's own pump.fun dev buy) + launch-fee transfer. The browser
   signs with the mint keypair it generated, Phantom signs as creator, the browser sends via Helius, then calls
   `confirm-launch` (§4.3).
6. The coin is listed on the **Graveyard** feed and gets a coin page.

## 3. Architecture

```
Browser (Next.js static export, Netlify CDN)
  │  reads: Supabase public views (RLS)      writes: Edge Functions only
  │  signs: fee transfers and the create tx (Phantom) + mint keypair (generated in the browser)
  ▼
Supabase (free plan)
  Edge Functions (Deno):
    costume         create generation · verify fee payment · OpenRouter edit · store PNG
    prepare-launch  IPFS upload (costumed PNG + metadata) · PumpPortal create-only tx · check · add own dev buy + fee
    confirm-launch  verify the create tx on-chain · insert launch
    admin           settings, prompts, pause switch, OpenRouter credit balance
  Storage bucket: art (public; originals/<uuid>.<ext> and costumes/<uuid>.<ext>, unguessable paths, so the coin
    page can show the original next to the costume)
  Market caps: the $NOOB live engine (token-launch-site skill), in the browser over Helius: on the coin page a
    websocket on the bonding curve / PumpSwap trades; on the Graveyard one batched curve read every 15 s; DEX Screener
    only as snapshot and fallback (no server job)
  Postgres + RLS: public views only
Outside: Helius RPC · OpenRouter · PumpPortal trade-local · pump.fun IPFS (Pinata fallback) · DEX Screener
```

- **No spending keys on the server.** The server never holds a key that can move funds. The treasury is a wallet
  the owner controls in Phantom; functions only read the chain.
- **Shared logic** lives in `packages/core` (pure TypeScript, no I/O), as in IdeaPad. Copy and adapt from IdeaPad:
  `pump-tx.ts` (create-transaction checker; SpookPad adds `pump-buy.ts`, its own dev buy), `pump-services.ts` (IPFS +
  PumpPortal), wallet sign-in, admin sign-in
  (`ADMIN_WALLET`, `signMessage`, `/<ADMIN_SLUG>`), build scripts.

## 4. Functions

### 4.1 `costume`
- `POST {action:"start", draftId, costume, image}` (signed-in): validates image and costume, stores the original in
  `art/originals/<id>.<ext>` (≤ 3 MB), inserts `generations` row `awaiting_payment`, returns `{generationId, feeLamports,
  treasury}`. Refuses when generations are paused (§6). First (best effort, never failing the request) it marks
  generations left `awaiting_payment` for over an hour `expired` (`expire_unpaid()`, 50 per call) and deletes their
  originals; an hour is safe because the fee transaction's blockhash expires ~90 s after start. The browser refuses
  to sign the fee unless `treasury` equals its own `NEXT_PUBLIC_TREASURY_ADDRESS`.
- `POST {action:"pay", generationId, signature}`:
  1. Fetches the transaction from Helius (`confirmed`): no error; fee payer = signed-in wallet; contains a System
     transfer from that wallet to `TREASURY_ADDRESS` of ≥ the fee recorded on the generation; contains Memo
     `spookpad:<generationId>`. Otherwise the call fails with a clear reason. If the transaction is not found yet, the
     call answers `waiting` and the browser asks again every 2 s for up to 90 s.
  2. One SQL transaction records `costume_payments(signature)` (the unique key rejects a reused signature) and marks
     the generation `paid`.
  3. Marks the generation then `generating`, and calls OpenRouter (§5). On success: stores the image in
     `art/costumes/<generationId>.<ext>`, state `ready`. On failure (refusal, no image, timeout 90 s, HTTP error): state
     back to `paid`, the error is returned; `POST {action:"retry", generationId}` tries again without a new payment
     (max 3 attempts, then `failed` and the admin sees it for a manual refund). While generations are paused, `pay`
     and `retry` start no AI attempt (409 "paused"); the generation stays `paid` for a later free retry. A generation
     stuck `generating` for 3 minutes (the function died) can be retried (the attempt is taken over); the site shows
     "Try again (free)" for it. A stuck third attempt nobody retries is marked `failed` when the admin lists refunds.
- Rate limit: max `MAX_GENERATIONS_PER_WALLET_PER_HOUR` (20) started generations.

### 4.2 `prepare-launch`
`POST {generationId, name, ticker, description, links, devBuySol, mint}` (signed-in; `mint` = public key of the
browser's mint keypair):
1. The generation must be `ready`, belong to the wallet, and not already be launched. Validates fields.
2. Uploads the **stored costumed PNG** and metadata to IPFS once per generation (cached `metadata_uri`).
3. Asks PumpPortal `trade-local` for `action:"create"` with `publicKey` = trader wallet, `mint`, metadata,
   **`amount: 0` (create only, always)**, `denominatedInSol: "true"`, `slippage` 10, `priorityFee` 0.0005,
   `pool: "pump"`. PumpPortal routes dev buys through its own program (`FAdo9NCw…`, seen 2026-10-08); the trader's
   wallet only signs pump.fun, System, ComputeBudget and Associated Token instructions, so SpookPad never asks it for
   a buy.
4. Reads the address-lookup tables the transaction uses (Helius `getMultipleAccounts`; addresses start at byte 56) and
   checks it with the adapted `pump-tx` checker: creates exactly this mint with this name, symbol and URI; creator and
   fee payer = trader; no buy; no SOL transfers at all (`MAX_EXTRA_TRANSFER_LAMPORTS = 0`).
5. Adds, keeping PumpPortal's instructions, blockhash and lookup tables: when `devBuySol` > 0, SpookPad's own dev buy
   (Associated Token `createIdempotent` for the trader's Token-2022 account, then pump.fun `buy_exact_sol_in`
   spending exactly the chosen lamports; it is in the same transaction as the create, so nobody trades first), then
   `SystemProgram.transfer(trader → TREASURY_ADDRESS, LAUNCH_FEE_LAMPORTS)`. The appends are lookup-table aware:
   an account already loaded (static or from a table) is reused, never listed twice; a called program a table loads
   (System, Associated Token) moves into the static keys; a new account the table holds is loaded from it; a
   table-loaded read-only account needed writable is refused. Refuses a result over 1232 bytes. Returns the unsigned
   transaction (base64) and records a `launches` row `pending` (mint, wallet, generation, fields).
6. Before the wallet signs, the browser decodes the transaction (resolving lookup tables) and refuses unless its only
   System instructions are transfers trader -> `NEXT_PUBLIC_TREASURY_ADDRESS` adding up to exactly the launch fee shown,
   and its `buy_exact_sol_in` spends exactly the dev buy entered (none when 0). If Helius refuses the signed
   transaction (preflight), it was never sent: the browser forgets the in-flight record at once.

### 4.3 `confirm-launch`
`POST {mint, signature}`: fetches the transaction (`confirmed`); it must be the pending launch's create transaction
(mint created, creator = wallet, launch fee paid to the treasury). Marks the launch `live` with `launched_at`.
Preparing a launch again for the same generation marks its earlier pending launch `abandoned` (a new mint each try);
the create transaction's URI, name and ticker must match what SpookPad prepared.

### 4.4 `admin`
Phantom `signMessage` sign-in as in IdeaPad. Shows and edits: `COSTUME_FEE_LAMPORTS`, `LAUNCH_FEE_LAMPORTS`,
`MAX_DEV_BUY_SOL`, generation pause switch, launch pause switch, each costume's prompt; OpenRouter credit balance
(`GET /api/v1/credits`); failed generations needing a refund; totals (fees received, generations, launches).

## 5. Costume prompts and the AI call

OpenRouter `POST /api/v1/chat/completions`, model `OPENROUTER_MODEL` (default `google/gemini-nano-banana-2.1`; check the exact id on openrouter.ai at implementation),
`modalities: ["image","text"]`, `image_config: {aspect_ratio: "1:1"}`, one user message with the original image
(data URL) and the prompt. The first image in `choices[0].message.images` is the result; it is stored as returned (the model
returns a 1:1 image of about 1024 px; the server checks it is a PNG, JPEG or WebP ≤ 8 MB).

Every prompt = shared rule + costume line:

> Edit this image. Keep the character exactly the same: same face, colors, art style, line work, proportions, pose and
> background. Do not add text or watermarks. Only add the following Halloween costume, drawn in the image's own art
> style so it looks like it belongs: …

| Costume | Line |
|---|---|
| Ghost sheet | a white bedsheet ghost costume draped over the character's body and head, with two cut-out eye holes showing the character's own eyes, the sheet's folds following its shape |
| Witch | a black pointy witch hat and a dark purple cape |
| Vampire | a high-collared black and red vampire cape and small fangs |
| Pumpkin head | a carved jack-o'-lantern worn as a helmet over the head, the face visible through the carved opening |
| Mummy | loose white bandage wrappings around the body and head, the eyes still visible |
| Skeleton | a black skeleton costume suit with white bones printed on it |
| Devil | small red devil horns, a red cape and a pointed tail |

Prompts are stored in the `costumes` table (§6) and editable in admin; the table above is the seed.

## 6. Data

| Table | Columns (main) |
|---|---|
| `settings` | key, value (fees, limits, pause switches) |
| `costumes` | slug, label, emoji, prompt, sort, enabled |
| `generations` | id, wallet, draft_id, costume, original_path, result_path, state (`awaiting_payment`/`paid`/`generating`/`ready`/`failed`/`expired`), fee_lamports, attempts, error, metadata_key, metadata_uri, refunded_at, created_at |
| `costume_payments` | signature (PK), generation_id, wallet, lamports, created_at |
| `launches` | mint (PK), wallet, generation_id, name, ticker, description, twitter, telegram, dev_buy_lamports, metadata_uri, launch_fee_lamports, create_signature, state (`pending`/`live`/`abandoned`), launched_at |

RLS: no direct table access for `anon`/`authenticated`. Public views: `v_graveyard` (live launches with their
original and costume image paths) and `my_generations` (signed-in wallet's own rows). Writes only through Edge Functions (service role).

**Auto-pause:** when the OpenRouter credit balance (checked after every generation) is below
`MIN_AI_CREDIT_USD` (default $2), generations pause and the site shows "The cauldron is empty — costumes are back
soon". Admin gets a Telegram DM if `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_CHAT_ID` are set.

## 7. Pages

- **Home / Graveyard:** hero ("Every coin wears a costume"), "Launch a coin" button, grid of live launches (costumed
  image, name, ticker, market cap, age), sorted newest or by market cap.
- **Launch:** the wizard of §2 with costume picker, preview, generation history, launch step.
- **Coin page** `/coin?mint=…`: costumed image, details, links, pump.fun and DEX Screener links, original-vs-costume
  reveal.
- **Admin** `/<ADMIN_SLUG>`: §4.4.

Look: dark Halloween theme (night purple, pumpkin orange, ghost white), visual details decided at implementation with
the frontend design skill.

## 8. Errors

| Case | Result |
|---|---|
| Fee transaction not confirmed yet | `retry` for up to 60 s, then "Payment not found — try again"; nothing is charged twice |
| Reused or wrong payment | Refused with reason |
| AI refuses / no image / timeout | Generation stays paid; free retry up to 3 attempts; then `failed`, admin refund list |
| Generations paused | Start refused before payment |
| PumpPortal tx fails checks | Launch refused, nothing signed |
| Trader rejects in Phantom / tx fails | Launch stays `pending`, can retry; becomes `abandoned` after 10 min |
| IPFS (pump.fun) fails | Pinata fallback when `PINATA_JWT` is set, else error |

## 9. Environment

| Variable | Where | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | .env, Netlify | Supabase project |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | .env, Netlify | Helius URL for the browser |
| `NEXT_PUBLIC_SITE_URL`, `ADMIN_SLUG` | .env, Netlify | Site URL, secret admin path |
| `NEXT_PUBLIC_TREASURY_ADDRESS` | .env, Netlify | Same as `TREASURY_ADDRESS`; the browser pays fees only there |
| `HELIUS_API_KEY` | Supabase | Server-side chain reads |
| `TREASURY_ADDRESS` | Supabase (+ shown on site) | Receives costume and launch fees |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Supabase | AI costume edits |
| `ADMIN_WALLET`, `ADMIN_SESSION_SECRET` | Supabase | Admin sign-in |
| `SITE_ORIGINS` | Supabase | CORS allow-list |
| `PINATA_JWT` (optional), `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_CHAT_ID` (optional) | Supabase | IPFS fallback, admin alerts |

## 10. Testing

Vitest, run in Node like IdeaPad:
- `core`: field validation, fee-payment verifier (amount, recipient, payer, memo, failed tx), create-tx checker,
  lookup-table-aware appends (decompiled with web3.js, no account listed twice), SpookPad's dev buy (PDAs checked
  against mainnet), the whole launch on a live PumpPortal create (opt-in mainnet simulation), prompt builder.
- `functions`: each handler with fake Helius, OpenRouter, PumpPortal, IPFS and storage — happy path, reused
  signature, AI failure then free retry, pause, low credit, launch confirm.
- Migrations: RLS lock-down test against embedded Postgres (as IdeaPad).

## 11. Out of scope (for now)

Telegram launch announcements, live WebSocket updates (pages poll), GIF costumes, community voting, sharing creator
fees with the platform.
