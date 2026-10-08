// The wallet a Supabase "Sign in with Web3" (Solana) session belongs to: custom_claims.address, or the address after
// "web3:solana:" in sub.
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function walletFromSession(session: { user?: { user_metadata?: unknown } } | null): string | null {
  const meta = session?.user?.user_metadata as { sub?: unknown; custom_claims?: { address?: unknown } } | undefined;
  const claim = meta?.custom_claims?.address;
  if (typeof claim === "string") return ADDRESS.test(claim) ? claim : null;
  const sub = typeof meta?.sub === "string" ? meta.sub : "";
  const wallet = sub.startsWith("web3:solana:") ? sub.slice(12) : "";
  return ADDRESS.test(wallet) ? wallet : null;
}
