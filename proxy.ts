/**
 * Next.js 16 renamed Middleware to Proxy (same mechanics, new name/file).
 * This is only the *optimistic* check (Next's own auth guide: "should not
 * be your only line of defense") — the real enforcement is
 * `lib/auth/dal.ts`'s `verifySession()`, called by every protected page.
 *
 * With Supabase configured, this also refreshes the Supabase session
 * cookie on every request (their own documented Next.js pattern) - a
 * Server Component can't write cookies itself, so without this, a
 * renewed token would never make it back to the browser.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/auth/session";

const PUBLIC_PREFIXES = ["/login", "/auth/callback", "/api/webhooks", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isSupabaseConfiguredAtEdge(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function checkMockAuth(request: NextRequest): Promise<boolean> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionCookieValue(cookieValue);
  return Boolean(payload && isEmailAllowed(payload.email));
}

async function refreshSupabaseSession(
  request: NextRequest,
): Promise<{ response: NextResponse; authenticated: boolean }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;
  const authenticated = Boolean(!error && email && isEmailAllowed(email));
  return { response, authenticated };
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isSupabaseConfiguredAtEdge()) {
    const { response, authenticated } = await refreshSupabaseSession(request);
    if (!authenticated && !isPublicPath(pathname)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (authenticated && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }

  const authenticated = await checkMockAuth(request);
  if (!authenticated && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (authenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
