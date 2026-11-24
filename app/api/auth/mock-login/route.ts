/**
 * Phase 1 stand-in for "Continue with Google" (DECISIONS.md). Only ever
 * signs in one of the two ALLOWED_EMAILS — never arbitrary input — so it
 * poses no more risk than the mock session scheme itself already does
 * before real Supabase Google OAuth replaces this file.
 */

import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { createSessionCookieValue, SESSION_COOKIE_MAX_AGE, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  if (!isEmailAllowed(email)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "not_allowed");
    return NextResponse.redirect(url, { status: 303 });
  }

  const cookieValue = await createSessionCookieValue(email);
  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}
