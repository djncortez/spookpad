"use client";
// Wallet sign-in: Supabase "Sign in with Web3" (Solana). The wallet signs a message (never a transaction); Supabase
// verifies it and creates the session; a database trigger creates the SpookPad user with that wallet.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useWallet } from "@solana/wallet-adapter-react";
import { walletFromSession } from "./session-wallet";
import { supabase } from "./supabase";

export const SIGN_IN_STATEMENT =
  "Sign in to SpookPad. This only proves you own this wallet. It is not a transaction and cannot move funds.";

interface AuthState {
  session: Session | null;
  wallet: string | null;
  busy: boolean;
  error: string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = walletFromSession(session);

  useEffect(() => {
    let sb;
    // a one-time setup failure raised synchronously on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { sb = supabase(); } catch (e) { setError((e as Error).message); return; }
    sb.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e: unknown) => setError((e as Error).message || "Couldn’t check your sign-in. Try again."));
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    await wallet.disconnect().catch(() => {});
  }, [wallet]);

  // A different wallet got connected than the one signed in: sign out so two wallets can't mix.
  useEffect(() => {
    const connected = wallet.publicKey?.toBase58();
    // signOut() only sets state after a network await
    if (signedIn && connected && connected !== signedIn) void signOut();
  }, [wallet.publicKey, signedIn, signOut]);

  const signIn = useCallback(async () => {
    if (!wallet.connected) { setError("Connect your wallet first."); return; }
    setBusy(true);
    setError(null);
    try {
      // wallet-adapter's context is structurally close to Supabase's SolanaWallet type; this is the documented usage
      // (https://supabase.com/docs/guides/auth/auth-web3), so only the TypeScript view is cast.
      const { error: err } = await supabase().auth.signInWithWeb3({
        chain: "solana",
        statement: SIGN_IN_STATEMENT,
        wallet,
      } as Parameters<ReturnType<typeof supabase>["auth"]["signInWithWeb3"]>[0]);
      if (err) setError(err.message);
    } catch (e) {
      setError((e as Error).message || "Sign-in was cancelled.");
    } finally {
      setBusy(false);
    }
  }, [wallet]);

  return (
    <AuthContext.Provider value={{ session, wallet: signedIn, busy, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
