import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { replaceConstituents } from "@/lib/db/sector-constituents";
import type { Market } from "@/lib/db/schema-types";
import { parseTickerCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const market = form.get("market");
  const sector = form.get("sector");
  const file = form.get("file");

  if ((market !== "IN" && market !== "US") || typeof sector !== "string" || !sector || !(file instanceof File)) {
    return NextResponse.redirect(new URL("/settings?error=invalid_upload", request.url), { status: 303 });
  }

  const text = await file.text();
  const tickers = parseTickerCsv(text);
  if (tickers.length === 0) {
    return NextResponse.redirect(new URL("/settings?error=empty_csv", request.url), { status: 303 });
  }

  await replaceConstituents(market as Market, sector, tickers);
  return NextResponse.redirect(
    new URL(`/settings?uploaded=${encodeURIComponent(sector)}:${tickers.length}`, request.url),
    { status: 303 },
  );
}
