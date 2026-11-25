import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth/allowed-emails";
import { getOptionalSession } from "@/lib/auth/dal";
import { getZerodhaSession } from "@/lib/db/provider-session";
import { searchIndexInstruments } from "@/lib/zerodha/instruments";

export const dynamic = "force-dynamic";

/**
 * Owner-only lookup so Praveen can find a sector index's real Kite
 * tradingsymbol himself instead of us guessing (DECISIONS.md) - sector
 * index symbols in sector-map-seed.ts are TradingView's own names, which
 * don't always match what Kite's instrument dump calls the same index.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session || !isOwnerEmail(session.email)) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  const zerodhaSession = await getZerodhaSession();
  if (!zerodhaSession) {
    return NextResponse.json({ error: "Zerodha not connected" }, { status: 400 });
  }

  const results = await searchIndexInstruments(zerodhaSession.accessToken, query);
  return NextResponse.json({ results });
}
