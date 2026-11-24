import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { saveZerodhaSession } from "@/lib/db/provider-session";
import { exchangeRequestToken } from "@/lib/zerodha/auth";

export const dynamic = "force-dynamic";

/**
 * Kite redirects here after login: `?status=success&request_token=...`
 * (or `?status=...` with no token on a cancelled/failed login). Never
 * throws past this handler - any failure just redirects to Settings with
 * an error flag, per BRIEF.md §10's "never crash, fall back to last close."
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  const settingsUrl = new URL("/settings", request.url);

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const requestToken = searchParams.get("request_token");

  if (status !== "success" || !requestToken) {
    settingsUrl.searchParams.set("zerodha", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const { accessToken, expiresAt } = await exchangeRequestToken(requestToken);
    await saveZerodhaSession(accessToken, expiresAt);
    settingsUrl.searchParams.set("zerodha", "connected");
  } catch (err) {
    console.error("[zerodha callback] failed to exchange request_token", err);
    settingsUrl.searchParams.set("zerodha", "error");
  }

  return NextResponse.redirect(settingsUrl);
}
