import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { getProviderForMarket } from "@/lib/providers";
import type { Market } from "@/lib/db/schema-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market");
  const symbol = searchParams.get("symbol");
  if ((market !== "IN" && market !== "US") || !symbol) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const provider = getProviderForMarket(market as Market);
  const bars = await provider.getWeeklyHistory(symbol, 60);
  return NextResponse.json({ bars });
}
