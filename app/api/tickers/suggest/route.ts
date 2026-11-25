import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { searchTickerSuggestions } from "@/lib/db/alerts";
import type { Market } from "@/lib/db/schema-types";

export const dynamic = "force-dynamic";

function parseMarket(value: string | null): Market | "ALL" {
  return value === "IN" || value === "US" ? value : "ALL";
}

/** Live ticker-search suggestions for Breakouts/Pullbacks' search box, debounced client-side. */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  const q = searchParams.get("q") ?? "";

  const suggestions = await searchTickerSuggestions(market, q);
  return NextResponse.json({ suggestions });
}
