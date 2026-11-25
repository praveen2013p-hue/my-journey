import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth/allowed-emails";
import { getOptionalSession } from "@/lib/auth/dal";
import type { Market } from "@/lib/db/schema-types";
import { setSectorSymbol } from "@/lib/db/sector-map";

export const dynamic = "force-dynamic";

/** Owner-only: confirms a real Kite tradingsymbol for a sector found via the search above. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  const settingsUrl = new URL("/settings", request.url);

  if (!session || !isOwnerEmail(session.email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const formData = await request.formData();
  const market = formData.get("market");
  const sector = formData.get("sector");
  const symbol = formData.get("symbol");

  if (
    (market !== "IN" && market !== "US") ||
    typeof sector !== "string" ||
    !sector ||
    typeof symbol !== "string" ||
    !symbol.trim()
  ) {
    settingsUrl.searchParams.set("resolve", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await setSectorSymbol(market as Market, sector, symbol.trim().toUpperCase());
    settingsUrl.searchParams.set("resolve", "ok");
  } catch (err) {
    console.error("[sector-map-resolve] failed", err);
    settingsUrl.searchParams.set("resolve", "error");
  }

  return NextResponse.redirect(settingsUrl);
}
