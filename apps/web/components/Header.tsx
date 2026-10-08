import Link from "next/link";
import { WalletButton } from "./WalletButton";

export function Header() {
  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
      <Link href="/" className="font-display text-3xl tracking-wide text-pumpkin">Spook<span className="text-ghost">Pad</span> 👻</Link>
      <nav className="flex items-center gap-4">
        <Link href="/" className="text-muted hover:text-ghost">Graveyard</Link>
        <Link href="/launch/" className="text-muted hover:text-ghost">Launch</Link>
        <WalletButton />
      </nav>
    </header>
  );
}
