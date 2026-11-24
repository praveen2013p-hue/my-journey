import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { listStrategyTags } from "@/lib/db/strategy-tags";
import { listTrades } from "@/lib/db/trades";
import { buildExportResponse } from "@/lib/export-response";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "market",
  "ticker",
  "strategy_tag",
  "buy_date",
  "quantity",
  "buy_price",
  "sell_date",
  "sell_price",
  "pnl",
  "pnl_pct",
];

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  const [tradesIn, tradesUs, tags] = await Promise.all([
    listTrades(session.userId, "IN"),
    listTrades(session.userId, "US"),
    listStrategyTags(session.userId),
  ]);
  const tagNamesById = new Map(tags.map((t) => [t.id, t.name]));

  const rows = [...tradesIn, ...tradesUs].map((t) => {
    const closed = t.sell_date !== null && t.sell_price !== null;
    const pnl = closed ? (t.sell_price! - t.buy_price) * t.quantity : null;
    const pnlPct = closed ? ((t.sell_price! - t.buy_price) / t.buy_price) * 100 : null;
    return [
      t.market,
      t.ticker,
      t.strategy_tag_id ? tagNamesById.get(t.strategy_tag_id) ?? "" : "",
      t.buy_date,
      t.quantity,
      t.buy_price,
      t.sell_date,
      t.sell_price,
      pnl,
      pnlPct,
    ];
  });

  return buildExportResponse("trades", COLUMNS, rows, format);
}
