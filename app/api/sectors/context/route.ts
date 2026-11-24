import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import type { Market } from "@/lib/db/schema-types";
import { getSectorContextsForTicker } from "@/lib/sector-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market");
  const ticker = searchParams.get("ticker");
  const weekEnding = searchParams.get("weekEnding");

  if ((market !== "IN" && market !== "US") || !ticker || !weekEnding) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const contexts = await getSectorContextsForTicker(market as Market, ticker, weekEnding);
  return NextResponse.json({ contexts });
}
