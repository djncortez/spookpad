"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { DEFAULT_COSTUME } from "@spookpad/core/costumes";
import { solToLamports } from "@spookpad/core/sol";
import { checkDevBuy, validateCoinFields } from "@spookpad/core/validate";
import { useAuth } from "@/lib/auth";
import { invoke } from "@/lib/call";
import {
  draftId as savedDraft, forgetLaunch, forgetPayment, newDraft, pendingPayment, rememberLaunch, rememberPayment, sentLaunch as storedLaunch,
  setDraft as saveDraft, type PendingPayment, type SentLaunch,
} from "@/lib/draft";
import { publicEnv } from "@/lib/env";
import { signFee } from "@/lib/fee-tx";
import { checkPending, isDefinitive, NotSent, sendRaw, type Expiry } from "@/lib/pending";
import { shortAddress, solText } from "@/lib/format";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { confirmLaunch, launchCoin, type LaunchStep } from "@/lib/launch-coin";
import { fetchCostumes, fetchDraftGenerations, fetchSettings, type Costume, type PublicSettings } from "@/lib/public-data";
import { finishPayment, retryCostume, summonCostume, type Generation, type SummonStep } from "@/lib/summon";
import { CostumePicker } from "./CostumePicker";
import { GenerationCard } from "./GenerationCard";
import { WalletButton } from "./WalletButton";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const treasuryText = publicEnv.treasury ? shortAddress(publicEnv.treasury) : "(not set up)";
const WRONG_WALLET = "Your wallet is on a different account than the one you signed in with. Switch accounts in your wallet and try again.";
const SUMMON_TEXT: Record<SummonStep, string> = {
  uploading: "Sending your mascot to the cauldron…",
  paying: "Approve the costume fee in your wallet…",
  brewing: "Brewing the costume… this takes 10 to 30 seconds.",
};
const LAUNCH_TEXT: Record<LaunchStep, string> = {
  preparing: "Preparing your coin…",
  signing: "Approve the launch in your wallet…",
  sending: "Sending it to Solana…",
  confirming: "Waiting for Solana to confirm…",
};

export function LaunchWizard() {
  const router = useRouter();
  const auth = useAuth();
  const wallet = useWallet();
  const { connection } = useConnection();
  const modal = useWalletModal();
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null); // the current draft, readable after an await
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [fields, setFields] = useState({ name: "", ticker: "", description: "", twitter: "", telegram: "" });
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [costume, setCostume] = useState(DEFAULT_COSTUME);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [devBuy, setDevBuy] = useState("0");
  // A fee sent but not yet seen by the costume function. Kept in state and a ref as well as storage, so it works without storage.
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const pendingRef = useRef<PendingPayment | null>(null);
  // A launch that was sent but not yet seen on Solana: check it again, never launch that costume again with a new mint.
  const [sentLaunch, setSentLaunch] = useState<SentLaunch | null>(null);
  const sentLaunchRef = useRef<SentLaunch | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchDraft = (id: string) => { draftRef.current = id; setDraftState(id); };

  // The wallet connected right now must be the one signed in; read at the moment it is needed, never from a stale render.
  const latest = useRef({ signedIn: auth.wallet, connected: wallet.publicKey?.toBase58() });
  useEffect(() => { latest.current = { signedIn: auth.wallet, connected: wallet.publicKey?.toBase58() }; });
  const connectedIsSignedIn = () => !!latest.current.signedIn && latest.current.connected === latest.current.signedIn;

  useEffect(() => {
    // browser-only values (localStorage), read once after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    switchDraft(savedDraft());
    fetchSettings().then(setSettings).catch((e: Error) => setError(e.message));
    fetchCostumes().then(setCostumes).catch((e: Error) => setError(e.message));
  }, []);

  // In-flight records belong to a wallet: load the signed-in wallet's, and nobody else's.
  useEffect(() => {
    const p = auth.wallet ? pendingPayment(auth.wallet) : null;
    const l = auth.wallet ? storedLaunch(auth.wallet) : null;
    pendingRef.current = p;
    sentLaunchRef.current = l;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(p);
    setSentLaunch(l);
  }, [auth.wallet]);

  const refresh = useCallback(async () => {
    if (!draft || !auth.wallet) return;
    const list = (await fetchDraftGenerations(draft)).filter((g) => g.state !== "awaiting_payment" && g.state !== "expired");
    if (draftRef.current !== draft) return; // the draft changed while this was loading: its list is not for the current draft
    setGenerations(list);
    const open = (g: Generation) => g.state === "ready" && !g.launched;
    setSelected((s) => (s && list.some((g) => g.id === s && open(g)) ? s : list.find(open)?.id ?? null));
  }, [draft, auth.wallet]);

  useEffect(() => {
    // refresh() sets state only after its network await
    void refresh().catch((e: Error) => setError(e.message));
  }, [refresh]);

  const prepareFee = useCallback(async (p: { treasury: string; lamports: number; memo: string }) => {
    const adapter = wallet.wallet?.adapter;
    if (!adapter) { modal.setVisible(true); throw new Error("Pick your wallet, then press Summon again."); }
    if (!adapter.connected) await adapter.connect();
    const from = adapter.publicKey?.toBase58();
    if (!from) throw new Error("Connect your wallet first.");
    if (auth.wallet && from !== auth.wallet) throw new Error(WRONG_WALLET);
    if (!("signTransaction" in adapter) || typeof adapter.signTransaction !== "function") throw new Error("Your wallet can't sign this payment. Try Phantom.");
    const sign = adapter.signTransaction.bind(adapter) as <T extends Transaction>(tx: T) => Promise<T>;
    return signFee({ connection, signTransaction: sign }, { from, ...p });
  }, [wallet, modal, auth.wallet, connection]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await job(); } catch (e) { setError((e as Error).message || "Something went wrong."); } finally { setBusy(false); setStatus(null); }
  };

  // Called for the wallet the summon started with; if the wallet has been switched since, only that wallet's storage is
  // written, never the screen.
  const remember = (forWallet: string | null, generationId: string, signature: string, expiry: Expiry) => {
    const p = { generationId, draftId: draftRef.current ?? "", signature, expiry };
    if (forWallet) rememberPayment(forWallet, p);
    if (latest.current.signedIn !== forWallet) return;
    pendingRef.current = p;
    setPending(p);
  };

  // The payment has definitely resolved (or can never land): forget it, and show the draft its costume belongs to.
  // Does nothing unless the current record is still the expected one for the expected wallet (wallet switched mid-flow).
  const resolvePayment = (expected: PendingPayment | null, forWallet: string | null) => {
    const p = pendingRef.current;
    if (!p || !expected || latest.current.signedIn !== forWallet) return;
    if (p.generationId !== expected.generationId || p.signature !== expected.signature) return;
    if (forWallet) forgetPayment(forWallet);
    pendingRef.current = null;
    setPending(null);
    if (p.draftId && p.draftId !== draftRef.current) { saveDraft(p.draftId); switchDraft(p.draftId); }
  };

  const afterCostume = async (g: Generation, expected: PendingPayment | null, forWallet: string | null) => {
    if (expected?.generationId === g.id) resolvePayment(expected, forWallet);
    if (g.state === "ready") setSelected(g.id);
    else if (g.error) setError(g.error);
    await refresh();
  };

  const summon = () => run(async () => {
    if (!image || !draft || pendingRef.current) return;
    const w = auth.wallet;
    const stored = w ? pendingPayment(w) : null; // another tab may have paid since this page loaded
    if (stored) {
      pendingRef.current = stored;
      setPending(stored);
      throw new Error("A costume payment is still being checked. Press Check payment first, so you don't pay twice.");
    }
    if (!settings) throw new Error("SpookPad's settings are still loading. Try again in a moment.");
    let g: Generation;
    let mine = null as PendingPayment | null; // the payment this summon made
    try {
      g = await summonCostume({
        invoke, prepareFee, wait, onStep: (s) => setStatus(SUMMON_TEXT[s]),
        remember: (generationId, signature, expiry) => {
          mine = { generationId, draftId: draftRef.current ?? "", signature, expiry };
          remember(w, generationId, signature, expiry);
        },
      }, { draftId: draft, costume, imageBase64: image.base64, feeLamports: settings.costume_fee_lamports, treasury: publicEnv.treasury });
    } catch (e) {
      // the server said no for good, or the RPC node refused the fee so it was never sent: nothing to wait for
      if (isDefinitive(e) || e instanceof NotSent) {
        resolvePayment(mine, w);
        void refresh().catch(() => {}); // e.g. paid but summoning paused: show the costume with its free retry
      }
      throw e;
    }
    await afterCostume(g, mine, w);
  });

  const checkPayment = () => run(async () => {
    const p = pendingRef.current;
    if (!p) return;
    const w = auth.wallet;
    const r = await checkPending(() => finishPayment({ invoke, wait, onStep: (s) => setStatus(SUMMON_TEXT[s]) }, p.generationId, p.signature),
      connection, p.signature, p.expiry, "That payment never went through — you can summon again.");
    if (r.kind === "done") await afterCostume(r.value, p, w);
    else if (r.kind === "cleared") { resolvePayment(p, w); setError(r.message); await refresh(); }
    else setError("Still waiting for Solana. Try again in a minute — you won't pay twice.");
  });

  const retry = (id: string) => run(async () => {
    setStatus(SUMMON_TEXT.brewing);
    const p = pendingRef.current;
    const w = auth.wallet;
    await afterCostume(await retryCostume(invoke, id), p, w);
  });

  const clearLaunch = () => {
    if (auth.wallet) forgetLaunch(auth.wallet);
    sentLaunchRef.current = null;
    setSentLaunch(null);
  };

  const launch = () => run(async () => {
    const stored = auth.wallet ? storedLaunch(auth.wallet) : null; // another tab may have launched since this page loaded
    if (stored || sentLaunchRef.current) {
      if (stored) { sentLaunchRef.current = stored; setSentLaunch(stored); }
      throw new Error("A launch is already waiting to be confirmed. Press Check launch first, so you don't launch twice.");
    }
    const checked = validateCoinFields(fields);
    if (!checked.ok) throw new Error(checked.errors.join(" "));
    if (!selected) throw new Error("Choose one of your costumes first.");
    if (!settings) throw new Error("SpookPad's settings are still loading. Try again in a moment.");
    let devBuyLamports: number;
    try { devBuyLamports = solToLamports(devBuy.trim() || "0"); } catch { throw new Error("The dev buy must be a SOL amount, like 0.5 (or 0 for none)."); }
    const devBuyProblem = checkDevBuy(devBuyLamports, settings.max_dev_buy_lamports);
    if (devBuyProblem) throw new Error(devBuyProblem);
    const signTransaction = wallet.signTransaction;
    if (!signTransaction) throw new Error("Your wallet can't sign this transaction. Try Phantom.");
    const trader = auth.wallet;
    if (!trader || !connectedIsSignedIn()) throw new Error(WRONG_WALLET);
    // launchCoin makes a new mint keypair and a new prepared transaction on every press and keeps neither afterwards,
    // so an earlier prepare (whose pending launch the server abandons) can never be sent.
    let mint: string;
    try {
      mint = await launchCoin({
      invoke, wait, onStep: (s) => setStatus(LAUNCH_TEXT[s]),
      lookupTable: async (address) => (await connection.getAddressLookupTable(address)).value,
      onSent: (m, sig, expiry) => { // before the send: a reload or crash must find this launch
        const l = { generationId: selected, mint: m, signature: sig, expiry };
        if (auth.wallet) rememberLaunch(auth.wallet, l);
        sentLaunchRef.current = l;
        setSentLaunch(l);
      },
      signWithWallet: (tx) => {
        if (!connectedIsSignedIn()) throw new Error(WRONG_WALLET); // checked again right before the wallet is asked
        return signTransaction(tx);
      },
      send: (raw) => sendRaw(connection, raw), // NotSent when the RPC node refused it (never broadcast)
      }, {
        generationId: selected, fields: checked.fields, devBuyLamports,
        trader, treasury: publicEnv.treasury, launchFeeLamports: settings.launch_fee_lamports,
      });
    } catch (e) {
      // the server said no for good, or the RPC node refused the transaction so it was never sent
      if ((isDefinitive(e) || e instanceof NotSent) && sentLaunchRef.current) clearLaunch();
      throw e;
    }
    clearLaunch();
    switchDraft(newDraft());
    router.push(`/coin/?mint=${mint}`);
  });

  const checkLaunch = () => run(async () => {
    const l = sentLaunchRef.current;
    if (!l) return;
    const r = await checkPending(() => confirmLaunch({ invoke, wait, onStep: (s) => setStatus(LAUNCH_TEXT[s]) }, l.mint, l.signature),
      connection, l.signature, l.expiry, "That launch never went through — you can launch again.");
    if (r.kind === "done") { clearLaunch(); switchDraft(newDraft()); router.push(`/coin/?mint=${r.value}`); }
    else if (r.kind === "cleared") { clearLaunch(); setError(r.message); }
    else setError("Still waiting for Solana. Try again in a minute — you can't launch this costume twice.");
  });

  const costumeOf = (slug: string) => costumes.find((c) => c.slug === slug);
  const field = (key: keyof typeof fields, label: string, props: Record<string, unknown> = {}) => (
    <label className="label">
      {label}
      <input className="input" value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} {...props} />
    </label>
  );
  const paused = settings?.generations_paused
    ? settings.pause_reason === "low_credit" ? "The cauldron is empty — costumes are back soon." : "Costume summoning is paused for a moment."
    : null;

  if (!auth.wallet) {
    return (
      <section className="card grid place-items-center gap-4 p-10 text-center">
        <div aria-hidden className="float text-6xl">👻</div>
        <h1 className="font-display text-4xl text-pumpkin">Launch a coin</h1>
        <p className="text-muted">Connect and sign in with your wallet to dress up your mascot and launch.</p>
        <WalletButton />
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-5xl text-pumpkin">Launch a coin</h1>

      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-bold">1. Your coin</h2>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <label className="card grid aspect-square cursor-pointer place-items-center overflow-hidden text-center text-sm text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image ? <img src={image.previewUrl} alt="Your mascot" className="h-full w-full object-cover" /> : <span className="p-4">Upload your mascot<br />PNG, JPG or WebP</span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void prepareImage(f).then(setImage).catch((err: Error) => setError(err.message)); }} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("name", "Name", { maxLength: 32, placeholder: "Spooky Frog" })}
            {field("ticker", "Ticker", { maxLength: 11, placeholder: "SFROG" })}
            <div className="sm:col-span-2">{field("description", "Description", { maxLength: 200 })}</div>
            {field("twitter", "X link (optional)", { placeholder: "https://x.com/…" })}
            {field("telegram", "Telegram link (optional)", { placeholder: "https://t.me/…" })}
          </div>
        </div>
        <p className="text-xs text-muted">No real people, real brands or trademarks, and nothing targeting private individuals.</p>
      </section>

      <section className="card grid gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">2. Pick a costume</h2>
          {settings && (
            <p className="text-sm text-muted">
              Each summon costs {solText(settings.costume_fee_lamports)}, paid to SpookPad&apos;s treasury{" "}
              <span className="font-mono" title={publicEnv.treasury}>{treasuryText}</span>. A failed summon is retried for free.
            </p>
          )}
        </div>
        <CostumePicker costumes={costumes} value={costume} onChange={setCostume} disabled={busy} />
        {paused && <p className="text-blood">{paused}</p>}
        {!publicEnv.treasury && <p className="text-blood">This site isn&apos;t set up yet (no treasury address), so summoning and launching are off.</p>}
        {pending && (
          <p className="text-sm">A costume you paid for is still brewing. <button className="underline" onClick={checkPayment} disabled={busy}>Check payment</button></p>
        )}
        <button className="btn justify-self-start" onClick={summon} disabled={busy || !image || !!paused || !!pending || !publicEnv.treasury}>🪄 Summon costume</button>
        {generations.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {generations.map((g) => (
              <GenerationCard key={g.id} g={g} costume={costumeOf(g.costume)} selected={g.id === selected}
                onSelect={() => setSelected(g.id)} onRetry={() => retry(g.id)} busy={busy} />
            ))}
          </div>
        )}
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="text-xl font-bold">3. Launch on pump.fun</h2>
        <label className="label max-w-xs">
          Dev buy in SOL (optional{settings ? `, up to ${solText(settings.max_dev_buy_lamports)}` : ""})
          <input className="input" inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value)} disabled={busy} />
        </label>
        {settings && (
          <p className="text-sm text-muted">
            You sign one transaction: it creates your coin with you as the creator (pump.fun creator fees go to you), buys your dev buy
            straight from pump.fun for exactly the SOL you enter, and pays the SpookPad launch fee of {solText(settings.launch_fee_lamports)} to
            SpookPad&apos;s treasury <span className="font-mono" title={publicEnv.treasury}>{treasuryText}</span>. SpookPad checks
            the transaction before your wallet sees it.
          </p>
        )}
        {settings?.launches_paused && <p className="text-blood">Launching is paused right now. Try again soon.</p>}
        {sentLaunch ? (
          <p className="text-sm">Your coin was sent but hasn&apos;t confirmed yet. <button className="underline" onClick={checkLaunch} disabled={busy}>Check launch</button></p>
        ) : (
          <button className="btn justify-self-start text-lg" onClick={launch} disabled={busy || !selected || !settings || !!settings.launches_paused || !publicEnv.treasury}>🎃 Launch coin</button>
        )}
      </section>

      {(status || error) && (
        <div role="status" aria-live="polite" className={`card sticky bottom-4 p-4 ${error ? "border-blood text-blood" : ""}`}>
          {error ?? status}
        </div>
      )}
    </div>
  );
}
