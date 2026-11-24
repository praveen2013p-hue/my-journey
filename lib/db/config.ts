import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * True once real Supabase credentials exist. Every repository function in
 * `lib/db/*` branches on this: Supabase when configured, the local JSON
 * store (DECISIONS.md) when not. Nothing else in the app should care which
 * one answered it.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let serviceClient: SupabaseClient | null = null;

/**
 * Server-only client authenticated as the service role (bypasses RLS).
 * Never import this from client components. Throws if called before
 * `isSupabaseConfigured()` is true — callers must check that first.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "getSupabaseServiceClient() called without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set. " +
        "Callers must check isSupabaseConfigured() first.",
    );
  }
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return serviceClient;
}
