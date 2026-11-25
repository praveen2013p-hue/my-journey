import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { createTrade, deleteAllTrades, listTrades } from "@/lib/db/trades";
import type { Market } from "@/lib/db/schema-types";

export const dynamic = "force-dynamic";

function parseMarket(value: unknown): Market | null {
  return value === "IN" || value === "US" ? value : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market")) ?? undefined;
  const trades = await listTrades(session.userId, market);
  return NextResponse.json({ trades });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const market = parseMarket(body?.market);
  const ticker = typeof body?.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const buyDate = typeof body?.buy_date === "string" ? body.buy_date : "";
  const quantity = Number(body?.quantity);
  const buyPrice = Number(body?.buy_price);
  const sellDate = typeof body?.sell_date === "string" && body.sell_date ? body.sell_date : null;
  const sellPriceRaw = body?.sell_price;
  const sellPrice = sellPriceRaw === null || sellPriceRaw === undefined || sellPriceRaw === "" ? null : Number(sellPriceRaw);
  const strategyTagId = typeof body?.strategy_tag_id === "string" && body.strategy_tag_id ? body.strategy_tag_id : null;
  const alertId = typeof body?.alert_id === "string" && body.alert_id ? body.alert_id : null;
  const stopLossRaw = body?.stop_loss;
  const stopLoss = stopLossRaw === null || stopLossRaw === undefined || stopLossRaw === "" ? null : Number(stopLossRaw);

  if (
    !market ||
    !ticker ||
    !buyDate ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(buyPrice) ||
    buyPrice <= 0 ||
    (sellPrice !== null && !Number.isFinite(sellPrice)) ||
    (stopLoss !== null && !Number.isFinite(stopLoss))
  ) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }
  if ((sellDate === null) !== (sellPrice === null)) {
    return NextResponse.json({ error: "sell_date_and_sell_price_must_be_set_together" }, { status: 400 });
  }

  const trade = await createTrade(session.userId, {
    market,
    ticker,
    buy_date: buyDate,
    quantity,
    buy_price: buyPrice,
    sell_date: sellDate,
    sell_price: sellPrice,
    strategy_tag_id: strategyTagId,
    alert_id: alertId,
    stop_loss: stopLoss,
  });
  return NextResponse.json({ trade }, { status: 201 });
}

/** "Reset all data" (Issue 14) - requires `?market=IN|US`; never deletes both markets in one call. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  if (!market) return NextResponse.json({ error: "market_required" }, { status: 400 });

  const deletedCount = await deleteAllTrades(session.userId, market);
  return NextResponse.json({ ok: true, deletedCount });
}
