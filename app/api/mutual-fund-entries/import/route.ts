import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { getMutualFundProfileById } from "@/lib/db/mutual-fund-profiles";
import { listMutualFundEntries, upsertMutualFundEntry } from "@/lib/db/mutual-funds";
import { parseMutualFundCsv } from "@/lib/mutual-fund-csv";

export const dynamic = "force-dynamic";

/**
 * Bulk-imports a CSV (same shape as the export) into one profile's entry
 * history, DECISIONS.md (CSV import/export). A month that already has an
 * entry for this profile is always skipped, never silently overwritten -
 * re-importing the same file twice is a no-op the second time, not a
 * way to accidentally wipe out edits made since the export.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const profileId = typeof body?.profile_id === "string" ? body.profile_id : "";
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!profileId || !csv) return NextResponse.json({ error: "missing_params" }, { status: 400 });

  const profile = await getMutualFundProfileById(session.userId, profileId);
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = parseMutualFundCsv(csv);
  if (parsed.duplicateMonths.length > 0) {
    return NextResponse.json(
      { error: "duplicate_months_in_file", months: parsed.duplicateMonths, rejected: parsed.rejected },
      { status: 400 },
    );
  }

  const existing = await listMutualFundEntries(session.userId, profileId);
  const existingMonths = new Set(existing.map((e) => e.month));

  const created: string[] = [];
  const skipped: string[] = [];
  for (const row of parsed.rows) {
    if (existingMonths.has(row.month)) {
      skipped.push(row.month);
      continue;
    }
    await upsertMutualFundEntry(session.userId, profileId, row.input);
    created.push(row.month);
  }

  return NextResponse.json({ created, skipped, rejected: parsed.rejected });
}
