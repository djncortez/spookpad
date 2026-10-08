"use client";
import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import { AuthProvider } from "@/lib/auth";
import { publicEnv } from "@/lib/env";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = publicEnv.solanaRpcUrl || clusterApiUrl("mainnet-beta");
  // Phantom, Solflare and other modern wallets register themselves (Wallet Standard): no adapters needed.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AuthProvider>{children}</AuthProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
