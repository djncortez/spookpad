export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-8 text-sm text-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/showcase/plain.webp" alt="" aria-hidden width={64} height={64} loading="lazy" className="float h-16 w-16 shrink-0 rounded-2xl border border-line" />
      <p>SpookPad launches coins on pump.fun. Coins are created and signed by the traders who launch them. Meme coins are risky: never spend more than you can lose.</p>
    </footer>
  );
}
