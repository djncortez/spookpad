"use client";
import { useEffect, useState } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/lib/auth";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const wallet = useWallet();
  const modal = useWalletModal();
  const auth = useAuth();
  // Phones without a wallet extension: offer to reopen the page inside Phantom's browser (decided after mount).
  const [phantomLink, setPhantomLink] = useState<string | null>(null);
  useEffect(() => {
    const installed = wallet.wallets.some((w) => w.readyState === WalletReadyState.Installed);
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    // a client-only value that must differ from the server-rendered null exactly once, after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhantomLink(!installed && mobile
      ? `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`
      : null);
  }, [wallet.wallets]);

  if (auth.wallet) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-line px-3 py-1.5 font-mono text-sm">👻 {shortAddress(auth.wallet)}</span>
        <button onClick={() => void auth.signOut()} className="text-sm text-muted underline">Sign out</button>
      </div>
    );
  }
  if (phantomLink) return <a href={phantomLink} className="btn">Open in Phantom</a>;
  if (!wallet.connected) return <button onClick={() => modal.setVisible(true)} className="btn">Connect wallet</button>;
  return (
    <button onClick={() => void auth.signIn()} disabled={auth.busy} className="btn">
      {auth.busy ? "Check your wallet…" : "Sign in"}
    </button>
  );
}
