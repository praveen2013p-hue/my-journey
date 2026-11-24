/**
 * Server-side Supabase client for real Google sign-in (BRIEF.md §2),
 * cookie-backed per Supabase's own Next.js App Router pattern. Only ever
 * created when `isSupabaseConfigured()` is true - callers must check
 * that first, same convention as `lib/db/config.ts`'s service client.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which can't set cookies -
          // proxy.ts refreshes the session cookie on every request instead.
        }
      },
    },
  });
}
