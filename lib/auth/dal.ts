/**
 * Data Access Layer session check (Next.js auth guide's recommended
 * pattern). This, not `proxy.ts`, is the real enforcement point —
 * `proxy.ts` only does a cheap optimistic redirect. `userId` doubles as
 * the per-user RLS key once real Supabase auth exists; for the mock
 * session it's just the email (DECISIONS.md).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isEmailAllowed } from "./allowed-emails";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./session";

export interface Session {
  email: string;
  userId: string;
}

async function readSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionCookieValue(value);
  if (!payload || !isEmailAllowed(payload.email)) return null;
  return { email: payload.email, userId: payload.email };
}

/** Use in any protected server component/layout/route. Redirects to /login if not signed in by an allow-listed email. */
export const verifySession = cache(async (): Promise<Session> => {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
});

/** For places that render differently when signed out instead of redirecting (e.g. the login page itself). */
export const getOptionalSession = cache(readSession);
