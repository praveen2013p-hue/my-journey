/**
 * Ties the pure ranking engine (lib/sector-metrics.ts) to storage: reads
 * every stored snapshot for a market, ranks the given week, and persists
 * one sector_metrics row per sector. Cheap enough (at most a few hundred
 * rows for 2 years * ~28 sectors) to just re-run whenever a page needs
 * current numbers, rather than maintaining a separate cache to invalidate.
 */

import { computeSectorRanking, type SnapshotLite } from "../sector-metrics";
import { computeSectorIndexPriceChange1w, computeTradedValue } from "../traded-value";
import { listConstituents } from "./sector-constituents";
import { getSectorMapEntry } from "./sector-map";
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
    ranked.map(async (row) => {
      // Each sector's extra metrics (index price, traded value) need
      // their own provider calls and must never take the others down
      // with them - the ranking/focus numbers above are already safe.
      let priceChg1w: number | null = null;
      let tradedValue: TradedValueFields = EMPTY_TRADED_VALUE;
      try {
        const mapEntry = await getSectorMapEntry(market, row.sector);
        priceChg1w = await computeSectorIndexPriceChange1w(market, mapEntry?.provider_symbol ?? null);
        const tickers = await listConstituents(market, row.sector);
        tradedValue = await computeTradedValue(market, tickers, weekEnding);
      } catch (err) {
        console.error(`[sector-metrics] extra metrics failed for ${market}/${row.sector}`, err);
      }

      await upsertSectorMetric({
        market,
        week_ending: row.weekEnding,
        sector: row.sector,
        rank: row.rank,
        mrs: row.mrs,
        d4: row.delta4,
        d13: row.delta13,
        d26: row.delta26,
        d52: row.delta52,
        traded_value: tradedValue.tradedValue,
        tv_avg10: tradedValue.tvAvg10,
        tv_ratio: tradedValue.tvRatio,
        is_focus: row.isFocus,
        price_chg_1w: priceChg1w,
        rs_chg_1w: row.rsChg1w,
        traded_value_chg_1w: tradedValue.tradedValueChg1w,
        rank_move_1w: row.rankMove1w,
      });
    }),
  );
}

type TradedValueFields = {
  tradedValue: number | null;
  tvAvg10: number | null;
  tvRatio: number | null;
  tradedValueChg1w: number | null;
};
const EMPTY_TRADED_VALUE: TradedValueFields = {
  tradedValue: null,
  tvAvg10: null,
  tvRatio: null,
  tradedValueChg1w: null,
};
