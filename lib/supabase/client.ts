/**
 * Browser Supabase client - only ever used from the "Continue with
 * Google" button (lib/supabase/server.ts is server-only), which itself
 * only renders when Supabase is configured (BRIEF.md §2).
 */

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
