/**
 * Ties the pure ranking engine (lib/sector-metrics.ts) to storage: reads
 * every stored snapshot for a market, ranks the given week, and persists
 * one sector_metrics row per sector. Cheap enough (at most a few hundred
 * rows for 2 years * ~28 sectors) to just re-run whenever a page needs
 * current numbers, rather than maintaining a separate cache to invalidate.
 */

import { computeSectorRanking, type SnapshotLite } from "../sector-metrics";
import {
  listSectorSnapshotHistory,
  upsertSectorMetric,
} from "./sectors";
import type { Market } from "./schema-types";

export async function computeAndStoreSectorMetrics(
  market: Market,
  weekEnding: string,
): Promise<void> {
  const history = await listSectorSnapshotHistory(market);
  const historyBySector: Record<string, SnapshotLite[]> = {};
  for (const row of history) {
    (historyBySector[row.sector] ??= []).push({
      weekEnding: row.week_ending,
      stage: row.stage,
      mrs: row.mrs,
    });
  }

  const ranked = computeSectorRanking(historyBySector, weekEnding);

  await Promise.all(
    ranked.map((row) =>
      upsertSectorMetric({
        market,
        week_ending: row.weekEnding,
        sector: row.sector,
        rank: row.rank,
        mrs: row.mrs,
        d4: row.delta4,
        d13: row.delta13,
        d26: row.delta26,
        d52: row.delta52,
        traded_value: null,
        tv_avg10: null,
        tv_ratio: null,
        is_focus: row.isFocus,
        price_chg_1w: null,
        rs_chg_1w: row.rsChg1w,
        traded_value_chg_1w: null,
        rank_move_1w: row.rankMove1w,
      }),
    ),
  );
}
