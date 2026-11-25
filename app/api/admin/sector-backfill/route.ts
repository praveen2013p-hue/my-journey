import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth/allowed-emails";
import { getOptionalSession } from "@/lib/auth/dal";
import { backfillSectorIndexHistory } from "@/lib/db/sector-backfill-orchestrator";
import type { Market } from "@/lib/db/schema-types";

export const dynamic = "force-dynamic";
// Up to ~29 sectors x one rate-limited historical fetch each; give it room
// to finish in one request rather than timing out mid-run.
export const maxDuration = 60;

/**
 * Owner-only admin action, triggered from Settings (BRIEF.md §7.2's
 * "Backfill on first run"). Never throws past the handler - any failure
 * just redirects back to Settings with an error flag, same principle as
 * the Zerodha callback.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  const settingsUrl = new URL("/settings", request.url);

  if (!session || !isOwnerEmail(session.email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const formData = await request.formData();
  const market = formData.get("market");
  if (market !== "IN" && market !== "US") {
    settingsUrl.searchParams.set("backfill", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const results = await backfillSectorIndexHistory(market as Market);
    const weeksStored = results.reduce((sum, r) => sum + r.weeksStored, 0);
    const sectorsStored = results.filter((r) => r.status === "stored").length;
    const sectorsUnresolved = results.filter((r) => r.status === "no-provider-symbol").length;
    const sectorsNoData = results.filter((r) => r.status === "no-price-data").length;

    settingsUrl.searchParams.set(
      "backfill",
      `${market}:${sectorsStored}:${weeksStored}:${sectorsUnresolved}:${sectorsNoData}`,
    );
  } catch (err) {
    console.error(`[sector backfill] failed for ${market}`, err);
    settingsUrl.searchParams.set("backfill", "error");
  }

  return NextResponse.redirect(settingsUrl);
}
