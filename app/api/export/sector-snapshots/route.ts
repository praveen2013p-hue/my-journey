import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { listSectorSnapshotHistory } from "@/lib/db/sectors";
import { buildExportResponse } from "@/lib/export-response";

export const dynamic = "force-dynamic";

const COLUMNS = ["market", "week_ending", "sector", "stage", "mrs", "vs_ma", "chg4", "focus", "source"];

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  const [snapshotsIn, snapshotsUs] = await Promise.all([
    listSectorSnapshotHistory("IN"),
    listSectorSnapshotHistory("US"),
  ]);
  const rows = [...snapshotsIn, ...snapshotsUs].map((s) => [
    s.market,
    s.week_ending,
    s.sector,
    s.stage,
    s.mrs,
    s.vs_ma,
    s.chg4,
    s.focus,
    s.source,
  ]);

  return buildExportResponse("sector-snapshots", COLUMNS, rows, format);
}
