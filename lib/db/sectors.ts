/**
 * Minimal sector_snapshots repository for the webhook (BRIEF.md §5c). The
 * full ranking/RS-delta engine (sector_metrics, traded value, focus star)
 * is Phase 2 — this just stores each snapshot row idempotently so no data
 * is lost between now and then.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { Market, SectorMetricRow, SectorSnapshotRow } from "./schema-types";

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

/**
 * Same upsert as `upsertSectorSnapshot`, but for many rows in one round
 * trip - the 2-year backfill (BRIEF.md §7.2) writes up to ~100 weeks per
 * sector and one request per week would be far too slow/chatty for a
 * single admin action to do synchronously.
 */
export async function upsertSectorSnapshotsBulk(
  inputs: UpsertSectorSnapshotInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sector_snapshots")
      .upsert(inputs, { onConflict: "market,week_ending,sector" });
    if (error) throw error;
    return;
  }

  await mutateStore((store) => {
    for (const input of inputs) {
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
    }
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
  const store = await readStore();
  return store.sector_snapshots.filter((s) => s.market === market && s.week_ending === weekEnding).length;
}

/** Every stored snapshot for a market, across all weeks - the history the ranking engine needs for Δn/rank_move. */
export async function listSectorSnapshotHistory(market: Market): Promise<SectorSnapshotRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sector_snapshots")
      .select("*")
      .eq("market", market)
      .order("week_ending", { ascending: true });
    if (error) throw error;
    return data as SectorSnapshotRow[];
  }
  const store = await readStore();
  return store.sector_snapshots
    .filter((s) => s.market === market)
    .sort((a, b) => (a.week_ending < b.week_ending ? -1 : 1));
}

/** The latest week_ending that has any sector snapshot for this market, or null. */
export async function getLatestSectorWeekEnding(market: Market): Promise<string | null> {
  const history = await listSectorSnapshotHistory(market);
  if (history.length === 0) return null;
  return history.reduce((latest, s) => (s.week_ending > latest ? s.week_ending : latest), history[0].week_ending);
}

export async function upsertSectorMetric(
  row: Omit<SectorMetricRow, "id" | "created_at">,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sector_metrics")
      .upsert(row, { onConflict: "market,week_ending,sector" });
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const idx = store.sector_metrics.findIndex(
      (m) => m.market === row.market && m.week_ending === row.week_ending && m.sector === row.sector,
    );
    const full: SectorMetricRow = {
      id: idx >= 0 ? store.sector_metrics[idx].id : store.sector_metrics.length + 1,
      ...row,
      created_at: new Date().toISOString(),
    };
    if (idx >= 0) store.sector_metrics[idx] = full;
    else store.sector_metrics.push(full);
  });
}

export async function listSectorMetricsForWeek(
  market: Market,
  weekEnding: string,
): Promise<SectorMetricRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sector_metrics")
      .select("*")
      .eq("market", market)
      .eq("week_ending", weekEnding);
    if (error) throw error;
    return data as SectorMetricRow[];
  }
  const store = await readStore();
  return store.sector_metrics.filter((m) => m.market === market && m.week_ending === weekEnding);
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
  const store = await readStore();
  if (store.sector_snapshots.length === 0) return null;
  return store.sector_snapshots.reduce(
    (latest, s) => (s.created_at > latest ? s.created_at : latest),
    store.sector_snapshots[0].created_at,
  );
}
