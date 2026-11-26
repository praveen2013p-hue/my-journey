/**
 * "RS Rank History" (DECISIONS.md): each sector's 1-99 RS percentile
 * rank at four calendar-day checkpoints - 30, 15, 5, and 0 days before
 * the current week ending - so a user can see at a glance whether a
 * sector's relative strength has been accelerating or fading, not just
 * its single latest value. Copied in concept from a competitor's
 * screenshot the user showed ("RS RANK HISTORY: 30→15→5→0").
 *
 * Sectors only, never industries - the caller must pre-filter
 * `historyBySector` to "sector"-kind entries before calling this, the
 * same way lib/sector-rotation.ts already does for its own rotation
 * matrix. "RS rank among sectors" and "RS rank among industries" are
 * two different populations; mixing them would make neither
 * percentile meaningful.
 *
 * Each checkpoint's percentile is computed against whichever sectors
 * had a resolved snapshot AT THAT CHECKPOINT - the market's whole RS
 * distribution as it stood then, not today's universe reused four
 * times over. A sector with no snapshot at or before a checkpoint gets
 * null for it, same "never approximate" discipline as
 * lib/sector-metrics.ts's own snapshotAtOrBefore.
 */

import { computeRsRatingPercentiles } from "./rs-rating";
import type { SnapshotLite } from "./sector-metrics";

/** Oldest first: 30 days ago, 15 days ago, 5 days ago, today (0 days back). */
export const RS_RANK_HISTORY_DAYS_BACK = [30, 15, 5, 0] as const;

function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** The snapshot at or before `targetDate`, closest first - same tolerant lookup as lib/sector-metrics.ts's own snapshotAtOrBefore, reimplemented here since that one isn't exported. */
function snapshotAtOrBefore(history: SnapshotLite[], targetDate: string): SnapshotLite | null {
  const candidates = history.filter((s) => s.weekEnding <= targetDate);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, s) => (s.weekEnding > latest.weekEnding ? s : latest));
}

/**
 * For every sector key in `historyBySector` (caller must pre-filter to
 * "sector" kind only), returns a 4-entry [30d, 15d, 5d, 0d] array of
 * 1-99 RS percentiles, oldest first. `asOfDate` is normally the
 * current week's week_ending.
 */
export function computeSectorRsRankHistory(
  historyBySector: Record<string, SnapshotLite[]>,
  asOfDate: string,
): Record<string, (number | null)[]> {
  const sectors = Object.keys(historyBySector);
  const checkpointDates = RS_RANK_HISTORY_DAYS_BACK.map((daysBack) => subtractDays(asOfDate, daysBack));

  const percentilesByCheckpoint: Map<string, number>[] = checkpointDates.map((targetDate) => {
    const mrsBySector = new Map<string, number>();
    for (const sector of sectors) {
      const snap = snapshotAtOrBefore(historyBySector[sector], targetDate);
      if (snap && snap.mrs !== null) mrsBySector.set(sector, snap.mrs);
    }
    return computeRsRatingPercentiles(mrsBySector);
  });

  const result: Record<string, (number | null)[]> = {};
  for (const sector of sectors) {
    result[sector] = percentilesByCheckpoint.map((pctMap) => pctMap.get(sector) ?? null);
  }
  return result;
}
