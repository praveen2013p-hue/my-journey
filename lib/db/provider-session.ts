/**
 * Repository for `provider_session` - the Zerodha Kite access token
 * (BRIEF.md §10/§11). The token itself is always encrypted at rest
 * (lib/auth/token-encryption.ts) and never logged or returned in full to
 * the client; callers here only ever see the decrypted value, used
 * server-side to call Kite.
 */

import { decryptToken, encryptToken } from "../auth/token-encryption";
import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";

export interface ZerodhaSession {
  accessToken: string;
  expiresAt: string | null;
}

/** Null if never connected, expired, or the stored value can't be decrypted (treated as "not connected," never thrown to a page - BRIEF.md §10). */
export async function getZerodhaSession(): Promise<ZerodhaSession | null> {
  let row: { access_token_encrypted: string | null; expires_at: string | null } | null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("provider_session")
      .select("access_token_encrypted, expires_at")
      .eq("provider", "zerodha")
      .maybeSingle();
    if (error) throw error;
    row = data;
  } else {
    const store = await readStore();
    row = store.provider_session.find((p) => p.provider === "zerodha") ?? null;
  }

  if (!row?.access_token_encrypted) return null;
  if (row.expires_at && row.expires_at < new Date().toISOString()) return null;

  try {
    const accessToken = await decryptToken(row.access_token_encrypted);
    return { accessToken, expiresAt: row.expires_at };
  } catch (err) {
    console.error("[provider-session] failed to decrypt stored Zerodha token", err);
    return null;
  }
}

export async function saveZerodhaSession(accessToken: string, expiresAt: string): Promise<void> {
  const encrypted = await encryptToken(accessToken);
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("provider_session")
      .upsert(
        { provider: "zerodha", access_token_encrypted: encrypted, expires_at: expiresAt, updated_at },
        { onConflict: "provider" },
      );
    if (error) throw error;
    return;
  }

  await mutateStore((store) => {
    const row = store.provider_session.find((p) => p.provider === "zerodha");
    if (row) {
      row.access_token_encrypted = encrypted;
      row.expires_at = expiresAt;
      row.updated_at = updated_at;
    } else {
      store.provider_session.push({
        id: store.provider_session.length + 1,
        provider: "zerodha",
        access_token_encrypted: encrypted,
        expires_at: expiresAt,
        updated_at,
      });
    }
  });
}

export async function clearZerodhaSession(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("provider_session").delete().eq("provider", "zerodha");
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.provider_session = store.provider_session.filter((p) => p.provider !== "zerodha");
  });
}
