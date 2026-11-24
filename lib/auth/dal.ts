/**
 * Data Access Layer session check (Next.js auth guide's recommended
 * pattern). This, not `proxy.ts`, is the real enforcement point —
 * `proxy.ts` only does a cheap optimistic redirect.
 *
 * Two sources of truth, same `Session` shape either way:
 *  - Supabase configured: a real Google-signed-in user
 *    (`supabase.auth.getUser()`, re-validated against Supabase's own
 *    servers every time - not just reading the cookie, which `getUser()`
 *    vs `getSession()` is specifically for). `userId` is the real
 *    `auth.users.id` UUID every per-user table's foreign key expects.
 *  - Not configured (local dev, BRIEF.md/DECISIONS.md): the mock
 *    "pick your account" cookie. `userId` is just the email.
 *
 * Either way, the allow-list is re-checked here on every request - a
 * valid Google sign-in from an email that isn't one of the two allowed
 * ones is still not let in (BRIEF.md §2).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isEmailAllowed } from "./allowed-emails";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./session";
import { isSupabaseConfigured } from "../db/config";
import { createSupabaseServerClient } from "../supabase/server";

export interface Session {
  email: string;
  userId: string;
}

async function readSupabaseSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (error || !email || !isEmailAllowed(email)) return null;
  return { email, userId: data.user!.id };
}

async function readMockSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionCookieValue(value);
  if (!payload || !isEmailAllowed(payload.email)) return null;
  return { email: payload.email, userId: payload.email };
}

async function readSession(): Promise<Session | null> {
  return isSupabaseConfigured() ? readSupabaseSession() : readMockSession();
}

/** Use in any protected server component/layout/route. Redirects to /login if not signed in by an allow-listed email. */
export const verifySession = cache(async (): Promise<Session> => {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
});

/** For places that render differently when signed out instead of redirecting (e.g. the login page itself). */
export const getOptionalSession = cache(readSession);
