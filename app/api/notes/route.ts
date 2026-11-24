import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { getStockNote, saveStockNote } from "@/lib/db/notes";
import type { Market } from "@/lib/db/schema-types";

export const dynamic = "force-dynamic";

function parseMarket(value: string | null): Market | null {
  return value === "IN" || value === "US" ? value : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  const ticker = searchParams.get("ticker");
  if (!market || !ticker) return NextResponse.json({ error: "invalid_params" }, { status: 400 });

  const note = await getStockNote(session.userId, market, ticker);
  return NextResponse.json({ note });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const market = parseMarket(body?.market ?? null);
  const ticker = typeof body?.ticker === "string" ? body.ticker : null;
  const note = typeof body?.note === "string" ? body.note : null;
  if (!market || !ticker || note === null) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  await saveStockNote(session.userId, market, ticker, note.slice(0, 4000));
  return NextResponse.json({ ok: true });
}
