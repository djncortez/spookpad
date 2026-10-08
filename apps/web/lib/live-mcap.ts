// Live market cap for one pump.fun coin: the $NOOB site's engine (token-launch-site skill, live-mcap.js, tested against
// live tokens 2026-09-26), as a module. Primary: subscribe to the coin's on-chain state over the Helius websocket so
// the number moves on every trade: the bonding curve before graduation, the price of each PumpSwap trade after. The
// pool may be quoted in SOL or another token (e.g. cbLTC); Jupiter supplies its USD price. Fallback: DEX Screener.
// Learned on $NOOB, keep: DEX Screener trails trades (snapshot/fallback only); PumpSwap's vault ratio reads 13-26% low
// (price each trade instead); supply is a fixed 1B; the public Solana RPC refuses browsers (a keyed Helius URL is needed).
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";     // bonding curve
export const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"; // AMM after graduation
export const WSOL = "So11111111111111111111111111111111111111112";
export const PUMP_SUPPLY = 1e9; // pump.fun tokens mint a fixed 1B supply
const SUB = { curve: 1, base: 2, quote: 3 } as const; // websocket request ids per subscribed account
const TRADE_SETTLE_MS = 150; // wait for both vault updates of one trade before pricing it
const MCAP_POLL_MS = 5000;     // fallback: DEX Screener refresh when the live feed isn't available
const QUOTE_PRICE_MS = 30000;  // how often to refresh the quote token's USD price

export interface RpcAccount { owner?: string; data?: unknown }
export interface CurveState { vTok: number; vQuote: number; supply: number; complete: boolean }
export type McapSource = "chain" | "dexscreener";

export function b64bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58(bytes: Uint8Array): string {
  let n = 0n;
  let s = "";
  for (const x of bytes) n = n * 256n + BigInt(x);
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of bytes) { if (x) break; s = "1" + s; }
  return s;
}

// bonding curve: 8-byte discriminator, then u64 reserves/supply, then `complete`
// (the quote reserve is in the quote token's base units: lamports for SOL)
export function readCurve(value: RpcAccount | null | undefined): CurveState | null {
  if (!value || value.owner !== PUMP_PROGRAM || !Array.isArray(value.data)) return null;
  const b = b64bytes(String(value.data[0]));
  if (b.length < 49) return null;
  const v = new DataView(b.buffer);
  const u = (o: number) => Number(v.getBigUint64(o, true));
  return { vTok: u(8), vQuote: u(16), supply: u(40), complete: b[48] === 1 };
}

export const curveMarketCap = (c: CurveState, quoteDecimals: number, quoteUsd: number): number =>
  (c.vQuote / 10 ** quoteDecimals) / (c.vTok / 1e6) * (c.supply / 1e6) * quoteUsd;

// PumpSwap pool: 8-byte discriminator, bump u8, index u16, then
// creator / base_mint / quote_mint / lp_mint / base_vault / quote_vault pubkeys
export function readPool(value: RpcAccount | null | undefined, ca: string): { quoteMint: string; baseVault: string; quoteVault: string } | null {
  if (!value || value.owner !== PUMPSWAP_PROGRAM || !Array.isArray(value.data)) return null;
  const b = b64bytes(String(value.data[0]));
  if (b.length < 203) return null;
  const key = (o: number) => b58(b.subarray(o, o + 32));
  if (key(43) !== ca) return null; // must be this token's pool
  return { quoteMint: key(75), baseVault: key(139), quoteVault: key(171) };
}

export function vaultAmount(value: RpcAccount | null | undefined): number | null {
  const s = (value?.data as { parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } } } | undefined)?.parsed?.info?.tokenAmount?.uiAmountString;
  return s === undefined ? null : parseFloat(s);
}

// PumpSwap prices trades off more than the raw vault balances, so the vault ratio reads low (13-26% in testing).
// Instead use what each trade actually paid: quote moved / tokens moved.
export const tradePrice = (dBase: number, dQuote: number): number | null =>
  dBase && dQuote && Math.sign(dBase) !== Math.sign(dQuote) ? Math.abs(dQuote / dBase) : null;

interface Feed {
  stopped: boolean; done: boolean; opened: boolean; tries: number;
  subs: Record<string, "curve" | "base" | "quote">;
  ws: WebSocket | null;
  poll?: ReturnType<typeof setInterval>; price?: ReturnType<typeof setInterval>;
  retry?: ReturnType<typeof setTimeout>; settle?: ReturnType<typeof setTimeout>;
  curve: string | null; pool: string | null; quoteMint: string | null;
  quoteUsd: number | null; quoteDecimals: number | null;
  graduated: boolean; curveState: CurveState | null; poolPrice: number | null;
  vaults: { quoteMint: string; baseVault: string; quoteVault: string } | null;
  cur: { base?: number | null; quote?: number | null }; prev: { base?: number | null; quote?: number | null };
}

export function watchMarketCap(o: {
  ca: string;
  rpcUrl: string;
  onUpdate(mc: number, source: McapSource): void;
  fetchFn?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
}): () => void {
  const fetchFn = o.fetchFn ?? fetch;
  const Socket = o.WebSocketImpl ?? WebSocket;
  const f: Feed = {
    stopped: false, done: false, opened: false, tries: 0, subs: {}, ws: null, curve: null, pool: null, quoteMint: null,
    quoteUsd: null, quoteDecimals: null, graduated: false, curveState: null, poolPrice: null, vaults: null, cur: {}, prev: {},
  };
  const show = (mc: number, source: McapSource) => { if (!f.stopped && Number.isFinite(mc)) o.onUpdate(mc, source); };

  // DEX Screener: market cap snapshot, the pump.fun market addresses, and the quote token
  async function dexLookup() {
    try {
      const r = await fetchFn(`https://api.dexscreener.com/latest/dex/tokens/${o.ca}`);
      const j = (await r.json()) as { pairs?: { dexId: string; pairAddress: string; quoteToken: { address: string }; marketCap?: number; fdv?: number; priceUsd?: string; priceNative?: string; liquidity?: { usd?: number } }[] };
      const pairs = (j.pairs ?? []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const p = pairs[0];
      const curve = pairs.find((x) => x.dexId === "pumpfun");
      const pool = pairs.find((x) => x.dexId === "pumpswap");
      const market = pool ?? curve;
      return {
        mc: p ? (p.marketCap ?? p.fdv ?? null) : null,
        curve: curve ? curve.pairAddress : null,
        pool: pool ? pool.pairAddress : null,
        quoteMint: market ? market.quoteToken.address : null,
        // backup quote price when Jupiter is unavailable (DEX Screener leaves priceUsd empty for some quotes)
        quoteUsd: market && +(market.priceUsd ?? 0) > 0 && +(market.priceNative ?? 0) > 0 ? +market.priceUsd! / +market.priceNative! : null,
      };
    } catch {
      return null;
    }
  }

  // Jupiter: USD price and decimals for any Solana mint
  async function jupPrices(mints: string[]): Promise<Record<string, { usdPrice?: number; decimals?: number }>> {
    try {
      const r = await fetchFn(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`);
      return await r.json();
    } catch {
      return {};
    }
  }
  async function refreshQuote(backupUsd?: number | null): Promise<boolean> {
    const q = (await jupPrices([f.quoteMint!]))[f.quoteMint!];
    if (q && (q.usdPrice ?? 0) > 0) { f.quoteUsd = q.usdPrice!; f.quoteDecimals = q.decimals ?? f.quoteDecimals; }
    else if (backupUsd && backupUsd > 0) f.quoteUsd = backupUsd;
    if (f.quoteDecimals == null && f.quoteMint === WSOL) f.quoteDecimals = 9;
    return (f.quoteUsd ?? 0) > 0;
  }

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const r = await fetchFn(o.rpcUrl, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = (await r.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result as T;
  }

  // market cap from whatever on-chain state the feed currently holds
  function redraw() {
    if (f.stopped || !((f.quoteUsd ?? 0) > 0)) return;
    if (!f.graduated && f.curveState && f.quoteDecimals != null) show(curveMarketCap(f.curveState, f.quoteDecimals, f.quoteUsd!), "chain");
    else if (f.graduated && f.poolPrice) show(f.poolPrice * PUMP_SUPPLY * f.quoteUsd!, "chain"); // same 1B supply as the curve
  }

  function stop() {
    f.stopped = true;
    clearInterval(f.poll); clearInterval(f.price); clearTimeout(f.retry); clearTimeout(f.settle);
    f.ws?.close();
  }

  async function start() {
    const info = await dexLookup();
    if (f.stopped) return;
    if (info && info.mc != null) show(info.mc, "dexscreener");
    if (!o.rpcUrl || !info || !info.quoteMint || !(info.curve || info.pool)) { startPolling(); return; }
    f.curve = info.curve; f.pool = info.pool; f.quoteMint = info.quoteMint;
    f.graduated = !f.curve;
    const priced = await refreshQuote(info.quoteUsd);
    if (f.stopped) return;
    if (!priced) { startPolling(); return; }
    f.price = setInterval(async () => {
      const i = await dexLookup();
      if (f.stopped) return;
      if (i && i.pool) f.pool = f.pool ?? i.pool;
      await refreshQuote(i?.quoteUsd);
      redraw();
    }, QUOTE_PRICE_MS);
    connect();
  }

  function startPolling() {
    if (f.stopped || f.poll) return;
    clearInterval(f.price);
    if (f.ws) { f.done = true; f.ws.close(); }
    const tick = async () => {
      const i = await dexLookup();
      let mc = i?.mc ?? null;
      if (mc == null) { // DEX Screener has no USD figure for some quote tokens: use Jupiter's token price
        const t = (await jupPrices([o.ca]))[o.ca];
        if (t && (t.usdPrice ?? 0) > 0) mc = t.usdPrice! * PUMP_SUPPLY;
      }
      if (mc != null) show(mc, "dexscreener");
    };
    void tick();
    f.poll = setInterval(tick, MCAP_POLL_MS);
  }

  function subscribe(id: number, account: string, encoding: string) {
    f.ws?.send(JSON.stringify({ jsonrpc: "2.0", id, method: "accountSubscribe", params: [account, { encoding, commitment: "processed" }] }));
  }

  async function watchCurve() {
    subscribe(SUB.curve, f.curve!, "base64");
    // the subscription only fires on the next trade, so read the current state once
    try { onCurve((await rpc<{ value: RpcAccount | null }>("getAccountInfo", [f.curve, { encoding: "base64", commitment: "processed" }])).value); }
    catch { /* the subscription will catch up on the next trade */ }
  }

  function onCurve(value: RpcAccount | null) {
    if (f.stopped || f.graduated) return;
    const c = readCurve(value);
    if (!c) return;
    if (c.complete) { void graduate(); return; }
    f.curveState = c;
    redraw();
  }

  // the curve is done: trading moved to the PumpSwap pool
  async function graduate() {
    f.graduated = true;
    const subId = Object.keys(f.subs).find((k) => f.subs[k] === "curve");
    if (subId && f.ws?.readyState === 1) f.ws.send(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "accountUnsubscribe", params: [+subId] }));
    if (!f.pool) { const i = await dexLookup(); f.pool = i?.pool ?? null; }
    if (f.stopped) return;
    if (f.pool) void watchPool(); else startPolling();
  }

  async function watchPool() {
    try {
      if (!f.vaults) {
        const pool = readPool((await rpc<{ value: RpcAccount | null }>("getAccountInfo", [f.pool, { encoding: "base64" }])).value, o.ca);
        if (!pool) throw new Error("not a PumpSwap pool for this token");
        f.vaults = pool;
        if (pool.quoteMint !== f.quoteMint) { // trust the chain over DEX Screener
          f.quoteMint = pool.quoteMint; f.quoteUsd = null; f.quoteDecimals = null;
          if (!(await refreshQuote())) throw new Error("no USD price for the pool's quote token");
        }
      }
      if (f.stopped || f.ws?.readyState !== 1) return;
      f.cur = {}; f.prev = {};
      subscribe(SUB.base, f.vaults.baseVault, "jsonParsed");
      subscribe(SUB.quote, f.vaults.quoteVault, "jsonParsed");
      const accts = (await rpc<{ value: (RpcAccount | null)[] }>("getMultipleAccounts",
        [[f.vaults.baseVault, f.vaults.quoteVault], { encoding: "jsonParsed", commitment: "processed" }])).value;
      f.prev = { base: vaultAmount(accts[0]), quote: vaultAmount(accts[1]) };
      f.cur = { ...f.prev };
      if (!f.poolPrice) f.poolPrice = await lastTradePrice();
      redraw();
    } catch {
      startPolling();
    }
  }

  // both vaults change in the same trade but arrive as two notifications: wait for the pair
  function settleTrade() {
    clearTimeout(f.settle);
    f.settle = setTimeout(() => {
      const p = tradePrice((f.cur.base ?? 0) - (f.prev.base ?? 0), (f.cur.quote ?? 0) - (f.prev.quote ?? 0));
      f.prev = { ...f.cur };
      if (p) { f.poolPrice = p; redraw(); }
    }, TRADE_SETTLE_MS);
  }

  // price of the most recent swap, from the vault balance changes recorded in its transaction
  async function lastTradePrice(): Promise<number | null> {
    try {
      const sigs = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [f.pool, { limit: 5 }]);
      for (const s of sigs) {
        if (s.err) continue;
        const tx = await rpc<{ meta: { preTokenBalances?: Bal[]; postTokenBalances?: Bal[] } | null; transaction: { message: { accountKeys: { pubkey: string }[] } } } | null>(
          "getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
        if (!tx || !tx.meta) continue;
        const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
        const bal = (list: Bal[] | undefined, acct: string) => {
          const e = (list ?? []).find((x) => keys[x.accountIndex] === acct);
          return e ? parseFloat(e.uiTokenAmount.uiAmountString) : 0;
        };
        const delta = (acct: string) => bal(tx.meta!.postTokenBalances, acct) - bal(tx.meta!.preTokenBalances, acct);
        const p = tradePrice(delta(f.vaults!.baseVault), delta(f.vaults!.quoteVault));
        if (p) return p;
      }
    } catch {
      // the next live trade will set the price
    }
    return null;
  }

  function connect() {
    const ws = (f.ws = new Socket(o.rpcUrl.replace(/^http/, "ws")));
    f.subs = {};
    ws.onopen = () => {
      f.opened = true; f.tries = 0;
      if (f.graduated) void watchPool(); else void watchCurve();
    };
    ws.onmessage = (e: MessageEvent | { data: string }) => {
      let m: { id?: number; result?: unknown; params?: { subscription: number; result?: { value: RpcAccount | null } } };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.id === SUB.curve) f.subs[String(m.result)] = "curve";
      else if (m.id === SUB.base) f.subs[String(m.result)] = "base";
      else if (m.id === SUB.quote) f.subs[String(m.result)] = "quote";
      if (!m.params?.result) return;
      const kind = f.subs[String(m.params.subscription)];
      const value = m.params.result.value;
      if (kind === "curve") onCurve(value);
      else if (kind === "base" || kind === "quote") { f.cur[kind] = vaultAmount(value); settleTrade(); }
    };
    ws.onclose = () => {
      if (f.stopped || f.done) return;
      if (!f.opened && f.tries >= 3) { startPolling(); return; } // RPC refused (bad key or domain not allowed)
      f.retry = setTimeout(() => { if (!f.stopped) connect(); }, Math.min(30000, 1000 * 2 ** f.tries++));
    };
  }

  void start();
  return stop;
}

interface Bal { accountIndex: number; uiTokenAmount: { uiAmountString: string } }
