// Small HTTP helpers shared by every Edge Function.
export const parseOrigins = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

export function corsHeaders(req: Request, origins: string[]): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!origins.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, content-type, apikey, x-client-info, x-retry-count, traceparent, tracestate, baggage",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    vary: "origin",
  };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export const bearer = (req: Request): string | null =>
  (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || null;
