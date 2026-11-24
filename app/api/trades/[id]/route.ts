import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { deleteTrade, getTradeById, updateTrade, type TradeUpdateInput } from "@/lib/db/trades";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getTradeById(session.userId, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const update: TradeUpdateInput = {};

  if (body?.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    }
    update.quantity = quantity;
  }
  if (body?.buy_date !== undefined) {
    if (typeof body.buy_date !== "string" || !body.buy_date) {
      return NextResponse.json({ error: "invalid_buy_date" }, { status: 400 });
    }
    update.buy_date = body.buy_date;
  }
  if (body?.buy_price !== undefined) {
    const buyPrice = Number(body.buy_price);
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      return NextResponse.json({ error: "invalid_buy_price" }, { status: 400 });
    }
    update.buy_price = buyPrice;
  }
  if (body?.strategy_tag_id !== undefined) {
    update.strategy_tag_id = body.strategy_tag_id === null ? null : String(body.strategy_tag_id);
  }

  // sell_date and sell_price close the trade - set together, or both cleared to reopen it.
  if (body?.sell_date !== undefined || body?.sell_price !== undefined) {
    const sellDate = body?.sell_date === null || body?.sell_date === "" ? null : (body.sell_date ?? existing.sell_date);
    const sellPriceRaw = body?.sell_price === null || body?.sell_price === "" ? null : (body.sell_price ?? existing.sell_price);
    const sellPrice = sellPriceRaw === null ? null : Number(sellPriceRaw);
    if (sellPrice !== null && !Number.isFinite(sellPrice)) {
      return NextResponse.json({ error: "invalid_sell_price" }, { status: 400 });
    }
    if ((sellDate === null) !== (sellPrice === null)) {
      return NextResponse.json({ error: "sell_date_and_sell_price_must_be_set_together" }, { status: 400 });
    }
    update.sell_date = sellDate;
    update.sell_price = sellPrice;
  }

  const trade = await updateTrade(session.userId, id, update);
  return NextResponse.json({ trade });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteTrade(session.userId, id);
  return NextResponse.json({ ok: true });
}
