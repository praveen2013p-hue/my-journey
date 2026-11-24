/**
 * Data Access Layer session check (Next.js auth guide's recommended
 * pattern). This, not `proxy.ts`, is the real enforcement point —
 * `proxy.ts` only does a cheap optimistic redirect. `userId` is the
 * per-user RLS/foreign-key value every per-user table expects: the raw
 * email without Supabase, or a real `auth.users` id once Supabase is
 * configured (lib/auth/supabase-user-id.ts - DECISIONS.md).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isEmailAllowed } from "./allowed-emails";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./session";
import { resolveSupabaseUserId } from "./supabase-user-id";

export interface Session {
  email: string;
  userId: string;
}

async function readSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionCookieValue(value);
  if (!payload || !isEmailAllowed(payload.email)) return null;
  const userId = await resolveSupabaseUserId(payload.email);
  return { email: payload.email, userId };
}

/** Use in any protected server component/layout/route. Redirects to /login if not signed in by an allow-listed email. */
export const verifySession = cache(async (): Promise<Session> => {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
});

/** For places that render differently when signed out instead of redirecting (e.g. the login page itself). */
export const getOptionalSession = cache(readSession);
