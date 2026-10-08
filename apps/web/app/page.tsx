import Link from "next/link";

export default function Home() {
  return (
    <section className="grid place-items-center gap-6 py-16 text-center">
      <div aria-hidden className="float text-8xl">👻</div>
      <h1 className="font-display text-5xl text-pumpkin sm:text-7xl">Every coin wears a costume</h1>
      <p className="max-w-xl text-lg text-muted">
        Upload your mascot, pick a Halloween costume, and AI dresses it up. Then launch it on pump.fun from your own wallet.
      </p>
      <Link href="/launch/" className="btn text-lg">Launch a coin</Link>
    </section>
  );
}
