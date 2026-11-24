import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import type { Market } from "@/lib/db/schema-types";
import { getCachedQuotes } from "@/lib/quotes-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market");
  const symbolsParam = searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (market !== "IN" && market !== "US") {
    return NextResponse.json({ error: "invalid_market" }, { status: 400 });
  }
  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  const quotes = await getCachedQuotes(market as Market, symbols);
  return NextResponse.json({
    quotes: Object.fromEntries(quotes.entries()),
  });
}
