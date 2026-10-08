import Link from "next/link";
import { Graveyard } from "@/components/Graveyard";

export default function Home() {
  return (
    <div className="grid gap-16">
      <section className="grid place-items-center gap-6 py-12 text-center">
        <div aria-hidden className="float text-8xl">👻</div>
        <h1 className="font-display text-5xl text-pumpkin sm:text-7xl">Every coin wears a costume</h1>
        <p className="max-w-xl text-lg text-muted">
          Upload your mascot, pick a Halloween costume, and AI dresses it up. Then launch it on pump.fun from your own wallet.
        </p>
        <Link href="/launch/" className="btn text-lg">Launch a coin</Link>
      </section>
      <Graveyard />
    </div>
  );
}
