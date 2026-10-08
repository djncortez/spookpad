// Solana keypairs for launches, and their encryption at rest (spec §6.1 step 2). A secret key is 64 bytes
// (32-byte ed25519 seed + 32-byte public key), the format Phantom and the Solana CLI use. Secrets are stored as
// "v1:<base64 iv|ciphertext>" encrypted with AES-256-GCM under COIN_KEY_MASTER (32 bytes, base64); a label (for
// example "coin:12:mint") is bound in as additional data, so a ciphertext can't be swapped onto another row.
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { fromBase64, toBase64, utf8 } from "./encoding";

export interface Keypair {
  publicKey: string;
  secretKey: Uint8Array; // 64 bytes
}

export function newKeypair(): Keypair {
  const seed = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(pub, 32);
  return { publicKey: bs58.encode(pub), secretKey };
}

// A 64-byte secret key (or its base58 text, as Phantom exports it); refuses one whose halves don't match.
export function keypairFromSecret(secret: Uint8Array | string): Keypair {
  const bytes = typeof secret === "string" ? bs58.decode(secret.trim()) : secret;
  if (bytes.length !== 64) throw new Error("A Solana secret key is 64 bytes.");
  const pub = ed25519.getPublicKey(bytes.slice(0, 32));
  if (!pub.every((b, i) => b === bytes[32 + i])) throw new Error("This secret key doesn't match its public key.");
  return { publicKey: bs58.encode(pub), secretKey: new Uint8Array(bytes) };
}

export const signBytes = (kp: Keypair, message: Uint8Array): Uint8Array => ed25519.sign(message, kp.secretKey.slice(0, 32));

async function masterKey(masterB64: string): Promise<CryptoKey> {
  const raw = fromBase64(masterB64.trim());
  if (raw.length !== 32) throw new Error("COIN_KEY_MASTER must be 32 bytes, base64.");
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(masterB64: string, secret: Uint8Array, label: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(label) as BufferSource }, await masterKey(masterB64), secret as BufferSource,
  ));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return `v1:${toBase64(out)}`;
}

export async function decryptSecret(masterB64: string, enc: string, label: string): Promise<Uint8Array> {
  if (!enc.startsWith("v1:")) throw new Error("Unknown key format.");
  const bytes = fromBase64(enc.slice(3));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) as BufferSource, additionalData: utf8(label) as BufferSource },
    await masterKey(masterB64), bytes.slice(12) as BufferSource,
  );
  return new Uint8Array(pt);
}
