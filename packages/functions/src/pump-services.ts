// The outside services a launch uses: IPFS for the coin's art and metadata (pump.fun's own free endpoint, or Pinata
// when PINATA_JWT is set and pump.fun's fails), PumpPortal to build the create-only transaction, and Telegram for admin
// alerts. Ported from IdeaPad (checked there 2026-09-29 against pumpportal.fun/creation and pump.fun).
import { EXT, type Art } from "@spookpad/core/image-type";

export interface CoinMetadata {
  name: string;
  symbol: string;
  description: string;
  twitter: string | null;
  telegram: string | null;
  website: string;
}

async function failure(res: Response, what: string): Promise<Error> {
  const text = (await res.text().catch(() => "")).slice(0, 200);
  return new Error(`${what}: HTTP ${res.status}${text ? ` ${text}` : ""}`);
}

// pump.fun's endpoint takes the image and the fields in one form and returns { metadataUri }.
export async function pumpFunIpfs(meta: CoinMetadata, art: Art, fetchFn: typeof fetch = fetch): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([art.bytes as BlobPart], { type: art.type }), `art.${EXT[art.type]}`);
  form.append("name", meta.name);
  form.append("symbol", meta.symbol);
  form.append("description", meta.description);
  form.append("twitter", meta.twitter ?? "");
  form.append("telegram", meta.telegram ?? "");
  form.append("website", meta.website);
  form.append("showName", "true");
  const res = await fetchFn("https://pump.fun/api/ipfs", { method: "POST", body: form });
  if (!res.ok) throw await failure(res, "pump.fun IPFS");
  const uri = ((await res.json()) as { metadataUri?: unknown }).metadataUri;
  if (typeof uri !== "string" || !/^https:\/\//.test(uri)) throw new Error("pump.fun IPFS: no metadata URI in the answer");
  return uri;
}

// Pinata: upload the image, then the metadata JSON pointing at it.
export async function pinataIpfs(jwt: string, meta: CoinMetadata, art: Art, fetchFn: typeof fetch = fetch): Promise<string> {
  const upload = async (blob: Blob, name: string) => {
    const form = new FormData();
    form.append("network", "public");
    form.append("file", blob, name);
    const res = await fetchFn("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { authorization: `Bearer ${jwt}` }, body: form });
    if (!res.ok) throw await failure(res, "Pinata");
    const cid = ((await res.json()) as { data?: { cid?: unknown } }).data?.cid;
    if (typeof cid !== "string") throw new Error("Pinata: no CID in the answer");
    return `https://ipfs.io/ipfs/${cid}`;
  };
  const image = await upload(new Blob([art.bytes as BlobPart], { type: art.type }), `art.${EXT[art.type]}`);
  const json = JSON.stringify({ ...meta, twitter: meta.twitter ?? undefined, telegram: meta.telegram ?? undefined, image, showName: true });
  return upload(new Blob([json], { type: "application/json" }), "metadata.json");
}

export function ipfsUploader(pinataJwt: string | undefined, fetchFn: typeof fetch = fetch) {
  return async (meta: CoinMetadata, art: Art): Promise<string> => {
    try {
      return await pumpFunIpfs(meta, art, fetchFn);
    } catch (e) {
      if (!pinataJwt) throw e;
      console.error("prepare-launch: pump.fun IPFS failed, trying Pinata", e);
      return pinataIpfs(pinataJwt, meta, art, fetchFn);
    }
  };
}

// The unsigned create transaction, create only: PumpPortal routes dev buys through its own program, which the trader's
// wallet must not sign for, so SpookPad adds its own pump.fun dev buy (Task 4). prepare-launch checks it before use.
export async function pumpPortalCreate(
  p: { creator: string; mint: string; name: string; symbol: string; uri: string },
  fetchFn: typeof fetch = fetch,
): Promise<Uint8Array> {
  const res = await fetchFn("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicKey: p.creator, action: "create", tokenMetadata: { name: p.name, symbol: p.symbol, uri: p.uri },
      mint: p.mint, denominatedInSol: "true", amount: 0, slippage: 10, priorityFee: 0.0005, pool: "pump",
    }),
  });
  if (res.status !== 200) throw await failure(res, "PumpPortal");
  return new Uint8Array(await res.arrayBuffer());
}

// Sends a Telegram message to the admin, or does nothing when the bot isn't set up.
export function telegramPoster(token: string | undefined, chatId: string | undefined, fetchFn: typeof fetch = fetch) {
  return async (text: string): Promise<void> => {
    if (!token || !chatId) return;
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw await failure(res, "Telegram");
  };
}
