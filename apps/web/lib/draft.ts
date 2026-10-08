// The Launch page's draft (its costumes belong together) and a fee payment sent but not yet checked, kept in this
// browser so a reload doesn't lose them. Storage can be unavailable (private windows): everything still works without it.
const DRAFT_KEY = "spookpad:draft";
const PAY_KEY = "spookpad:pending-payment";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function get(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable: nothing to keep
  }
}

export function newDraft(): string {
  const id = crypto.randomUUID();
  set(DRAFT_KEY, id);
  return id;
}

export function draftId(): string {
  const saved = get(DRAFT_KEY);
  return saved && UUID.test(saved) ? saved : newDraft();
}

export const rememberPayment = (generationId: string, signature: string): void =>
  set(PAY_KEY, JSON.stringify({ generationId, signature }));

export function pendingPayment(): { generationId: string; signature: string } | null {
  try {
    const p = JSON.parse(get(PAY_KEY) ?? "null") as { generationId?: unknown; signature?: unknown } | null;
    return p && typeof p.generationId === "string" && typeof p.signature === "string" ? { generationId: p.generationId, signature: p.signature } : null;
  } catch {
    return null;
  }
}

export const forgetPayment = (): void => set(PAY_KEY, null);
