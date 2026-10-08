import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Creepster, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";

const display = Creepster({ subsets: ["latin"], weight: "400", variable: "--font-creepster" });
const sans = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "SpookPad",
  description: "Launch your meme coin on pump.fun. Every coin wears a Halloween costume, stitched on by AI.",
  openGraph: { siteName: "SpookPad", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <div aria-hidden className="fog" />
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
