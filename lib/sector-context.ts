/**
 * The sectors a stock belongs to, with each one's current Stage/RS/focus -
 * feeds both the Quality Score's sector-strength bucket (BRIEF.md §9,
 * "use the best of the stock's constituent sectors") and the side panel's
 * "Sector context" section. Comes from the explicit sector_constituents
 * upload, never a guess from the alert's own free-text sector/industry
 * strings (those are TradingView's own categories and don't necessarily
 * match the 28 tracked index names).
 */

import { listSectorsForTicker } from "./db/sector-constituents";
import { listSectorMetricsForWeek, listSectorSnapshotHistory } from "./db/sectors";
import type { Market } from "./db/schema-types";
import type { Stage } from "./weinstein";

export interface SectorContextDetail {
  sector: string;
  stage: Stage | null;
  mrs: number | null;
  isFocus: boolean;
}

/**
 * `weekEnding` should be the alert's own week_ending - the sector board
 * for that same week may not have arrived yet, in which case a sector
 * shows up with `stage: null, mrs: null` (known to belong, not yet known
 * to be strong), exactly like any other "not there yet" data point.
 */
export async function getSectorContextsForTicker(
  market: Market,
  ticker: string,
  weekEnding: string,
): Promise<SectorContextDetail[]> {
  const sectors = await listSectorsForTicker(market, ticker);
  if (sectors.length === 0) return [];

  const [metrics, snapshotHistory] = await Promise.all([
    listSectorMetricsForWeek(market, weekEnding),
    listSectorSnapshotHistory(market),
  ]);

  return sectors.map((sector) => {
    const metric = metrics.find((m) => m.sector === sector);
    const snapshot = snapshotHistory.find((s) => s.sector === sector && s.week_ending === weekEnding);
    return {
      sector,
      stage: snapshot?.stage ?? null,
      mrs: metric?.mrs ?? snapshot?.mrs ?? null,
      isFocus: metric?.is_focus ?? false,
    };
  });
}
