// A Solana JSON-RPC call (Helius in production, a fake in tests).
export type Rpc = <T>(method: string, params: unknown[]) => Promise<T>;
