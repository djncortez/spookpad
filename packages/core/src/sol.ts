// SOL amounts are handled as integer lamports everywhere; these convert at the edges (forms, display).
export const LAMPORTS_PER_SOL = 1_000_000_000;

export function solToLamports(sol: string): number {
  const m = /^(\d+)(?:\.(\d{1,9}))?$/.exec(sol.trim());
  if (!m) throw new Error(`Not a SOL amount: "${sol}" (use digits and up to 9 decimals).`);
  return Number(m[1]) * LAMPORTS_PER_SOL + Number((m[2] ?? "").padEnd(9, "0"));
}

export function lamportsToSol(lamports: number): string {
  const whole = Math.floor(lamports / LAMPORTS_PER_SOL);
  const frac = String(lamports % LAMPORTS_PER_SOL).padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}
