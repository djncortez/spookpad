"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { DEFAULT_COSTUME } from "@spookpad/core/costumes";
import { solToLamports } from "@spookpad/core/sol";
import { checkDevBuy, validateCoinFields } from "@spookpad/core/validate";
import { useAuth } from "@/lib/auth";
import { invoke } from "@/lib/call";
import { draftId as savedDraft, forgetPayment, newDraft, pendingPayment, rememberPayment } from "@/lib/draft";
import { feeTransaction } from "@/lib/fee-tx";
import { solText } from "@/lib/format";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { confirmLaunch, launchCoin, type LaunchStep } from "@/lib/launch-coin";
import { fetchCostumes, fetchDraftGenerations, fetchSettings, type Costume, type PublicSettings } from "@/lib/public-data";
import { finishPayment, retryCostume, summonCostume, type Generation, type SummonStep } from "@/lib/summon";
import { CostumePicker } from "./CostumePicker";
import { GenerationCard } from "./GenerationCard";
import { WalletButton } from "./WalletButton";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
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
  const [draft, setDraft] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [fields, setFields] = useState({ name: "", ticker: "", description: "", twitter: "", telegram: "" });
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [costume, setCostume] = useState(DEFAULT_COSTUME);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [devBuy, setDevBuy] = useState("0");
  const [pending, setPending] = useState<{ generationId: string; signature: string } | null>(null);
  const pendingRef = useRef<{ generationId: string; signature: string } | null>(null);
  // A launch that was sent but not yet seen on Solana: check it again, never launch that costume again with a new mint.
  const [sentLaunch, setSentLaunch] = useState<{ generationId: string; mint: string; signature: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // browser-only values (localStorage), read once after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(savedDraft());
    const stored = pendingPayment();
    pendingRef.current = stored;
    setPending(stored);
    fetchSettings().then(setSettings).catch((e: Error) => setError(e.message));
    fetchCostumes().then(setCostumes).catch((e: Error) => setError(e.message));
  }, []);

  const refresh = useCallback(async () => {
    if (!draft || !auth.wallet) return;
    const list = (await fetchDraftGenerations(draft)).filter((g) => g.state !== "awaiting_payment");
    setGenerations(list);
    const open = (g: Generation) => g.state === "ready" && !g.launched;
    setSelected((s) => (s && list.some((g) => g.id === s && open(g)) ? s : list.find(open)?.id ?? null));
  }, [draft, auth.wallet]);

  useEffect(() => {
    // refresh() sets state only after its network await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch((e: Error) => setError(e.message));
  }, [refresh]);

  const payFee = useCallback(async (p: { treasury: string; lamports: number; memo: string }) => {
    const adapter = wallet.wallet?.adapter;
    if (!adapter) { modal.setVisible(true); throw new Error("Pick your wallet, then press Summon again."); }
    if (!adapter.connected) await adapter.connect();
    const from = adapter.publicKey?.toBase58();
    if (!from) throw new Error("Connect your wallet first.");
    if (auth.wallet && from !== auth.wallet) throw new Error(WRONG_WALLET);
    return adapter.sendTransaction(feeTransaction({ from, ...p }), connection);
  }, [wallet, modal, auth.wallet, connection]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await job(); } catch (e) { setError((e as Error).message || "Something went wrong."); } finally { setBusy(false); setStatus(null); }
  };

  // Kept in state as well as storage, so Summon stays blocked even where localStorage is unavailable.
  const remember = (generationId: string, signature: string) => {
    rememberPayment(generationId, signature);
    pendingRef.current = { generationId, signature };
    setPending(pendingRef.current);
  };

  const afterCostume = async (g: Generation) => {
    if (pendingRef.current?.generationId === g.id) {
      forgetPayment();
      pendingRef.current = null;
      setPending(null);
    }
    if (g.state === "ready") setSelected(g.id);
    else if (g.error) setError(g.error);
    await refresh();
  };

  const summon = () => run(async () => {
    if (!image || !draft || pendingRef.current) return;
    if (!settings) throw new Error("SpookPad's settings are still loading. Try again in a moment.");
    const g = await summonCostume({ invoke, payFee, wait, onStep: (s) => setStatus(SUMMON_TEXT[s]), remember },
      { draftId: draft, costume, imageBase64: image.base64, feeLamports: settings.costume_fee_lamports });
    await afterCostume(g);
  });

  const checkPayment = () => run(async () => {
    if (!pending) return;
    await afterCostume(await finishPayment({ invoke, wait, onStep: (s) => setStatus(SUMMON_TEXT[s]) }, pending.generationId, pending.signature));
  });

  const retry = (id: string) => run(async () => {
    setStatus(SUMMON_TEXT.brewing);
    await afterCostume(await retryCostume(invoke, id));
  });

  // The wallet connected right now must be the one signed in; read at the moment it is needed, never from a stale render.
  const latest = useRef({ signedIn: auth.wallet, connected: wallet.publicKey?.toBase58() });
  useEffect(() => { latest.current = { signedIn: auth.wallet, connected: wallet.publicKey?.toBase58() }; });
  const connectedIsSignedIn = () => !!latest.current.signedIn && latest.current.connected === latest.current.signedIn;

  const launch = () => run(async () => {
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
    if (!connectedIsSignedIn()) throw new Error(WRONG_WALLET);
    // launchCoin makes a new mint keypair and a new prepared transaction on every press and keeps neither afterwards,
    // so an earlier prepare (whose pending launch the server abandons) can never be sent.
    const mint = await launchCoin({
      invoke, wait, onStep: (s) => setStatus(LAUNCH_TEXT[s]),
      onSent: (m, sig) => setSentLaunch({ generationId: selected, mint: m, signature: sig }),
      signWithWallet: (tx) => {
        if (!connectedIsSignedIn()) throw new Error(WRONG_WALLET); // checked again right before the wallet is asked
        return signTransaction(tx);
      },
      send: (raw) => connection.sendRawTransaction(raw, { maxRetries: 5 }),
    }, { generationId: selected, fields: checked.fields, devBuyLamports });
    setSentLaunch(null);
    setDraft(newDraft());
    router.push(`/coin/?mint=${mint}`);
  });

  const checkLaunch = () => run(async () => {
    if (!sentLaunch) return;
    const mint = await confirmLaunch({ invoke, wait, onStep: (s) => setStatus(LAUNCH_TEXT[s]) }, sentLaunch.mint, sentLaunch.signature);
    setSentLaunch(null);
    setDraft(newDraft());
    router.push(`/coin/?mint=${mint}`);
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
          {settings && <p className="text-sm text-muted">Each summon costs {solText(settings.costume_fee_lamports)}. A failed summon is retried for free.</p>}
        </div>
        <CostumePicker costumes={costumes} value={costume} onChange={setCostume} disabled={busy} />
        {paused && <p className="text-blood">{paused}</p>}
        {pending && (
          <p className="text-sm">A costume you paid for is still brewing. <button className="underline" onClick={checkPayment} disabled={busy}>Check payment</button></p>
        )}
        <button className="btn justify-self-start" onClick={summon} disabled={busy || !image || !!paused || !!pending}>🪄 Summon costume</button>
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
            straight from pump.fun for exactly the SOL you enter, and pays the SpookPad launch fee of {solText(settings.launch_fee_lamports)}.
          </p>
        )}
        {settings?.launches_paused && <p className="text-blood">Launching is paused right now. Try again soon.</p>}
        {sentLaunch ? (
          <p className="text-sm">Your coin was sent but hasn't confirmed yet. <button className="underline" onClick={checkLaunch} disabled={busy}>Check launch</button></p>
        ) : (
          <button className="btn justify-self-start text-lg" onClick={launch} disabled={busy || !selected || !settings || !!settings.launches_paused}>🎃 Launch coin</button>
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
