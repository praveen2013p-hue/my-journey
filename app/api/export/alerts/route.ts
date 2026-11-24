import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { listAlerts } from "@/lib/db/alerts";
import { buildExportResponse } from "@/lib/export-response";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "market",
  "exchange",
  "ticker",
  "signal_type",
  "grade",
  "week_ending",
  "triggered_at",
  "trigger_price",
  "vol_ratio",
  "mrs",
  "pct_above_ma",
  "overhead_pct",
  "sector",
  "industry",
  "quality_score",
];

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  const alerts = await listAlerts({});
  const rows = alerts.map((a) => [
    a.market,
    a.exchange,
    a.ticker,
    a.signal_type,
    a.grade,
    a.week_ending,
    a.triggered_at,
    a.trigger_price,
    a.vol_ratio,
    a.mrs,
    a.pct_above_ma,
    a.overhead_pct,
    a.sector,
    a.industry,
    a.quality_score,
  ]);

  return buildExportResponse("alerts", COLUMNS, rows, format);
}
