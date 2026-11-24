/**
 * Zerodha Kite Connect login flow (BRIEF.md §10). Kite's access token
 * expires daily (~6am IST reset), so this is a real, recurring login
 * flow, not a one-time setup - "Connect Zerodha" / "Reconnect Zerodha"
 * both go through this same path.
 *
 * Deliberately plain `fetch` + one checksum call rather than the
 * `kiteconnect` npm SDK: only two REST calls are ever needed (build the
 * login URL, exchange request_token for access_token), so a dependency
 * for that is more surface than it's worth.
 */

import { createHash } from "crypto";

const KITE_LOGIN_URL = "https://kite.zerodha.com/connect/login";
const KITE_SESSION_TOKEN_URL = "https://api.kite.trade/session/token";

function requireEnv(name: "KITE_API_KEY" | "KITE_API_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to connect Zerodha.`);
  return value;
}

/** Where the "Connect Zerodha" button links to - Kite's own login page. */
export function buildKiteLoginUrl(): string {
  const apiKey = requireEnv("KITE_API_KEY");
  return `${KITE_LOGIN_URL}?api_key=${encodeURIComponent(apiKey)}&v=3`;
}

export interface KiteSession {
  accessToken: string;
  expiresAt: string;
}

/**
 * Next 6:00 AM IST strictly after `from` - Kite invalidates the previous
 * day's access token around this time every day, so this is the safe
 * estimate to show/act on (Kite's API itself doesn't return an explicit
 * expiry - BRIEF.md §10's "expires daily").
 */
export function next6amIst(from: Date): Date {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(from.getTime() + istOffsetMs);
  const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  let next6am = new Date(istMidnight.getTime() + 6 * 60 * 60 * 1000);
  if (next6am.getTime() <= istNow.getTime()) {
    next6am = new Date(next6am.getTime() + 24 * 60 * 60 * 1000);
  }
  return new Date(next6am.getTime() - istOffsetMs);
}

/** Exchanges the callback's request_token for a real access_token (BRIEF.md §10: "never store my Zerodha password or TOTP secret" - only this token ever touches the app). */
export async function exchangeRequestToken(requestToken: string): Promise<KiteSession> {
  const apiKey = requireEnv("KITE_API_KEY");
  const apiSecret = requireEnv("KITE_API_SECRET");
  const checksum = createHash("sha256").update(apiKey + requestToken + apiSecret).digest("hex");

  const response = await fetch(KITE_SESSION_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }).toString(),
  });

  const body = (await response.json().catch(() => null)) as { data?: { access_token?: string }; message?: string } | null;
  if (!response.ok || !body?.data?.access_token) {
    throw new Error(body?.message ?? `Kite session exchange failed (HTTP ${response.status}).`);
  }

  return { accessToken: body.data.access_token, expiresAt: next6amIst(new Date()).toISOString() };
}
