/**
 * Encrypts the Zerodha Kite access token at rest (BRIEF.md §11:
 * "TOKEN_ENC_KEY: encrypts your Kite login token at rest"). AES-256-GCM
 * via the Web Crypto API (`crypto.subtle`), not Node's `crypto` module,
 * so this works in both edge and Node runtimes - same reasoning as
 * lib/auth/session.ts's mock-auth cookie signing.
 *
 * TOKEN_ENC_KEY is just "any 32+ character random string" (README) - not
 * necessarily valid key bytes - so it's hashed with SHA-256 first to get
 * exactly 32 bytes for AES-256, whatever the input looks like.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.TOKEN_ENC_KEY;
  if (!secret) {
    throw new Error("TOKEN_ENC_KEY must be set to store a Zerodha access token.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Returns `iv.ciphertext`, both base64url, safe to store in a text column. */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Inverse of encryptToken. Throws if TOKEN_ENC_KEY changed or the value is corrupt - callers should treat that as "not connected." */
export async function decryptToken(stored: string): Promise<string> {
  const dotIndex = stored.indexOf(".");
  if (dotIndex < 0) throw new Error("Malformed encrypted token.");
  const key = await getKey();
  const iv = fromBase64Url(stored.slice(0, dotIndex));
  const ciphertext = fromBase64Url(stored.slice(dotIndex + 1));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}
