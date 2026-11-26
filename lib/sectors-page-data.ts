/**
 * Server-side data assembly for the Sectors page, BRIEF.md §7.2 + §16.
 */

import { subWeeks, format } from "date-fns";
import { getLatestMrsForTickers, listAlerts } from "./db/alerts";
import { computeAndStoreSectorMetrics } from "./db/sector-metrics-orchestrator";
import { listSectorMap } from "./db/sector-map";
import { listConstituentsBySector } from "./db/sector-constituents";
import {
  getLatestSectorWeekEnding,
  listSectorMetricsForWeek,
  listRecentSectorSnapshotHistory,
} from "./db/sectors";
import { computeSectorRsRankHistory } from "./sector-rs-rank-history";
import type { Market } from "./db/schema-types";
import type { Stage } from "./weinstein";

/** The sparkline only shows the last 13 weeks (BRIEF.md §7.2); a little slack in case a week is missing. */
const SPARKLINE_LOOKBACK_WEEKS = 16;

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
  /** Null when no constituent CSV has been uploaded for this sector yet (Settings -> admin upload), never a guess. */
  totalStocks: number | null;
  /** Of totalStocks, how many had mrs > 0 as of their latest alert. Null alongside totalStocks. */
  rsAbove0: number | null;
  /** Last 13 weeks of mrs, oldest first, for the trend sparkline. */
  sparkline: number[];
  /**
   * 1-99 RS percentile at [30d, 15d, 5d, 0d] ago, oldest first - null
   * entries where there's no resolved snapshot that far back yet.
   * Sectors only: always `[]` for an industry row, since "RS rank
   * among industries" is a different, unbuilt population (DECISIONS.md).
   */
  rsRankHistory: (number | null)[];
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

  const sinceWeekEnding = format(subWeeks(new Date(`${weekEnding}T00:00:00Z`), SPARKLINE_LOOKBACK_WEEKS), "yyyy-MM-dd");
  const [sectorMapRows, history, alertsThisWeek, constituentsBySector] = await Promise.all([
    listSectorMap(market),
    listRecentSectorSnapshotHistory(market, sinceWeekEnding),
    listAlerts({ weekEnding }),
    listConstituentsBySector(market),
  ]);

  const allConstituentTickers = Array.from(new Set(Array.from(constituentsBySector.values()).flat()));
  const latestMrsByTicker = await getLatestMrsForTickers(market, allConstituentTickers);

  const historyBySector = new Map<string, typeof history>();
  for (const snap of history) {
    const list = historyBySector.get(snap.sector) ?? [];
    list.push(snap);
    historyBySector.set(snap.sector, list);
  }

  // RS Rank History is a sectors-only concept (DECISIONS.md) - same
  // kind==="sector" scoping lib/sector-rotation.ts already uses for its
  // rotation matrix, so industries never enter the percentile pool.
  const sectorOnlyNames = new Set(sectorMapRows.filter((r) => r.kind === "sector").map((r) => r.display_name));
  const sectorOnlyHistory: Record<string, { weekEnding: string; stage: Stage | null; mrs: number | null }[]> = {};
  for (const [sector, snaps] of historyBySector) {
    if (!sectorOnlyNames.has(sector)) continue;
    sectorOnlyHistory[sector] = snaps.map((s) => ({ weekEnding: s.week_ending, stage: s.stage, mrs: s.mrs }));
  }
  const rsRankHistoryBySector = computeSectorRsRankHistory(sectorOnlyHistory, weekEnding);

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

    const sectorTickers = constituentsBySector.get(mapRow.display_name) ?? null;
    const rsAbove0 = sectorTickers
      ? sectorTickers.filter((ticker) => (latestMrsByTicker.get(ticker) ?? null) !== null && latestMrsByTicker.get(ticker)! > 0).length
      : null;

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
      totalStocks: sectorTickers ? sectorTickers.length : null,
      rsAbove0,
      sparkline,
      rsRankHistory: mapRow.kind === "sector" ? (rsRankHistoryBySector[mapRow.display_name] ?? [null, null, null, null]) : [],
    };
  });

  return { weekEnding, rows };
}
