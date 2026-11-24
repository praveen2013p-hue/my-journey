/**
 * Minimal sector_snapshots repository for the webhook (BRIEF.md §5c). The
 * full ranking/RS-delta engine (sector_metrics, traded value, focus star)
 * is Phase 2 — this just stores each snapshot row idempotently so no data
 * is lost between now and then.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore } from "./local-store";
import type { Market, SectorSnapshotRow } from "./schema-types";

export interface UpsertSectorSnapshotInput {
  market: Market;
  week_ending: string;
  sector: string;
  stage: 1 | 2 | 3 | 4 | null;
  mrs: number | null;
  rs_up: boolean | null;
  vs_ma: number | null;
  chg4: number | null;
  focus: boolean;
  source: "alert" | "backfill";
}

export async function upsertSectorSnapshot(
  input: UpsertSectorSnapshotInput,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sector_snapshots")
      .upsert(input, { onConflict: "market,week_ending,sector" });
    if (error) throw error;
    return;
  }

  await mutateStore((store) => {
    const idx = store.sector_snapshots.findIndex(
      (s) => s.market === input.market && s.week_ending === input.week_ending && s.sector === input.sector,
    );
    const row: SectorSnapshotRow = {
      id: idx >= 0 ? store.sector_snapshots[idx].id : store.sector_snapshots.length + 1,
      ...input,
      created_at: new Date().toISOString(),
    };
    if (idx >= 0) store.sector_snapshots[idx] = row;
    else store.sector_snapshots.push(row);
  });
}

export async function countSectorSnapshotsForWeek(
  market: Market,
  weekEnding: string,
): Promise<number> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { count, error } = await supabase
      .from("sector_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("market", market)
      .eq("week_ending", weekEnding);
    if (error) throw error;
    return count ?? 0;
  }
  const { readStore } = await import("./local-store");
  const store = await readStore();
  return store.sector_snapshots.filter((s) => s.market === market && s.week_ending === weekEnding).length;
}

/** Latest sector snapshot's received time, for the data-freshness strip (BRIEF.md §14.2). */
export async function getLatestSectorSnapshotTime(): Promise<string | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sector_snapshots")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.created_at ?? null;
  }
  const { readStore } = await import("./local-store");
  const store = await readStore();
  if (store.sector_snapshots.length === 0) return null;
  return store.sector_snapshots.reduce(
    (latest, s) => (s.created_at > latest ? s.created_at : latest),
    store.sector_snapshots[0].created_at,
  );
}
