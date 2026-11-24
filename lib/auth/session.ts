/**
 * Phase 1 mock session (DECISIONS.md) standing in for real Supabase Google
 * OAuth. A signed, HMAC-protected cookie — not a JWT, not Supabase's own
 * session format — so swapping to real auth later means replacing this
 * file and `app/api/auth/mock-login`, not anything that reads
 * `verifySession()` elsewhere in the app.
 *
 * Uses the Web Crypto API (`crypto.subtle`), not Node's `crypto` module,
 * so the same code works in both `proxy.ts` (edge runtime) and Node server
 * components.
 */

export const SESSION_COOKIE_NAME = "mj_session";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface MockSessionPayload {
  email: string;
  issuedAt: number;
}

function getSecret(): string {
  const secret = process.env.MOCK_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "MOCK_AUTH_SECRET must be set in production. Mock auth is a Phase 1 " +
        "stand-in for real Google OAuth — see DECISIONS.md.",
    );
  }
  return "dev-only-insecure-mock-auth-secret";
}

function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionCookieValue(email: string): Promise<string> {
  const payload: MockSessionPayload = { email, issuedAt: Date.now() };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(signature)}`;
}

export async function verifySessionCookieValue(
  value: string | undefined | null,
): Promise<MockSessionPayload | null> {
  if (!value) return null;
  const dotIndex = value.indexOf(".");
  if (dotIndex < 0) return null;
  const payloadB64 = value.slice(0, dotIndex);
  const signatureB64 = value.slice(dotIndex + 1);
  if (!payloadB64 || !signatureB64) return null;

  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signatureB64) as BufferSource,
      new TextEncoder().encode(payloadB64) as BufferSource,
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (typeof payload?.email !== "string" || typeof payload?.issuedAt !== "number") {
      return null;
    }
    return payload as MockSessionPayload;
  } catch {
    return null;
  }
}
