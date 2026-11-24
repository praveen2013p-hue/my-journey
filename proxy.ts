/**
 * Next.js 16 renamed Middleware to Proxy (same mechanics, new name/file).
 * This is only the *optimistic* check (Next's own auth guide: "should not
 * be your only line of defense") — the real enforcement is
 * `lib/auth/dal.ts`'s `verifySession()`, called by every protected page.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/auth/session";

const PUBLIC_PREFIXES = ["/login", "/api/webhooks", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionCookieValue(cookieValue);
  const authenticated = Boolean(payload && isEmailAllowed(payload.email));

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
