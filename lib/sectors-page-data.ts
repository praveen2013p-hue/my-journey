/**
 * Server-side data assembly for the Sectors page, BRIEF.md §7.2 + §16.
 */

import { listAlerts } from "./db/alerts";
import { computeAndStoreSectorMetrics } from "./db/sector-metrics-orchestrator";
import { listSectorMap } from "./db/sector-map";
import {
  getLatestSectorWeekEnding,
  listSectorMetricsForWeek,
  listSectorSnapshotHistory,
} from "./db/sectors";
import type { Market } from "./db/schema-types";
import type { Stage } from "./weinstein";

export interface SectorRow {
  sector: string;
  kind: "sector" | "industry";
  rank: number | null;
  stage: Stage | null;
  mrs: number | null;
  vsMa: number | null;
  priceChg1w: number | null;
  rsChg1w: number | null;
  tradedValueChg1w: number | null;
  rankMove1w: number | null;
  delta4: number | null;
  delta13: number | null;
  delta26: number | null;
  delta52: number | null;
  tradedValue: number | null;
  tvRatio: number | null;
  isFocus: boolean;
  triggerCount: number;
  /** Last 13 weeks of mrs, oldest first, for the trend sparkline. */
  sparkline: number[];
}

export interface SectorsPageData {
  weekEnding: string | null;
  rows: SectorRow[];
}

export async function getSectorsPageData(market: Market): Promise<SectorsPageData> {
  const weekEnding = await getLatestSectorWeekEnding(market);
  if (!weekEnding) return { weekEnding: null, rows: [] };

  // The webhook already recomputes sector_metrics (rank/focus/1W-price/
  // traded-value - each of those needing its own provider call) every time
  // a sector-board snapshot arrives. Re-running that on every page view
  // was making the Sectors page wait on ~30 Yahoo calls per visit; only
  // do it here as a fallback for a week nothing has computed yet.
  let metricsRows = await listSectorMetricsForWeek(market, weekEnding);
  if (metricsRows.length === 0) {
    await computeAndStoreSectorMetrics(market, weekEnding);
    metricsRows = await listSectorMetricsForWeek(market, weekEnding);
  }

  const [sectorMapRows, history, alertsThisWeek] = await Promise.all([
    listSectorMap(market),
    listSectorSnapshotHistory(market),
    listAlerts({ weekEnding }),
  ]);

  const historyBySector = new Map<string, typeof history>();
  for (const snap of history) {
    const list = historyBySector.get(snap.sector) ?? [];
    list.push(snap);
    historyBySector.set(snap.sector, list);
  }

  const triggerCountBySector = new Map<string, number>();
  for (const alert of alertsThisWeek) {
    if (!alert.sector) continue;
    triggerCountBySector.set(alert.sector, (triggerCountBySector.get(alert.sector) ?? 0) + 1);
  }

  const rows: SectorRow[] = sectorMapRows.map((mapRow) => {
    const metric = metricsRows.find((m) => m.sector === mapRow.display_name);
    const sectorHistory = (historyBySector.get(mapRow.display_name) ?? []).sort((a, b) =>
      a.week_ending < b.week_ending ? -1 : 1,
    );
    const currentSnapshot = sectorHistory.find((s) => s.week_ending === weekEnding) ?? null;
    const sparkline = sectorHistory
      .filter((s) => s.week_ending <= weekEnding)
      .slice(-13)
      .map((s) => s.mrs)
      .filter((v): v is number => v !== null);

    return {
      sector: mapRow.display_name,
      kind: mapRow.kind,
      rank: metric?.rank ?? null,
      stage: currentSnapshot?.stage ?? null,
      mrs: metric?.mrs ?? currentSnapshot?.mrs ?? null,
      vsMa: currentSnapshot?.vs_ma ?? null,
      priceChg1w: metric?.price_chg_1w ?? null,
      rsChg1w: metric?.rs_chg_1w ?? null,
      tradedValueChg1w: metric?.traded_value_chg_1w ?? null,
      rankMove1w: metric?.rank_move_1w ?? null,
      delta4: metric?.d4 ?? null,
      delta13: metric?.d13 ?? null,
      delta26: metric?.d26 ?? null,
      delta52: metric?.d52 ?? null,
      tradedValue: metric?.traded_value ?? null,
      tvRatio: metric?.tv_ratio ?? null,
      isFocus: metric?.is_focus ?? false,
      triggerCount: triggerCountBySector.get(mapRow.display_name) ?? 0,
      sparkline,
    };
  });

  return { weekEnding, rows };
}
