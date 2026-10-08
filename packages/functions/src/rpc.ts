// Solana JSON-RPC over fetch (Helius). Retries 429s with backoff; RPC errors throw with the method name.
import type { Rpc } from "@spookpad/core/rpc-types";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function jsonRpc(url: string, fetchFn: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = wait): Rpc {
  return async <T,>(method: string, params: unknown[]): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.status === 429 && attempt < 3) { await sleep(500 * 2 ** attempt); continue; }
      if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result as T;
    }
  };
}

export const heliusUrl = (apiKey: string) => `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
