/**
 * The sector ranking/RS-delta engine, BRIEF.md §7.2 and §16.
 *
 * Stage and this-week's Mansfield RS ("mrs") come straight from the
 * TradingView webhook (source of truth, same principle as stock alerts,
 * BRIEF.md §17.4) - this module never recomputes them. What it does
 * compute, purely from the history of stored weekly snapshots:
 *
 *  - Δ4/Δ13/Δ26/Δ52: this week's mrs minus mrs N weeks back (Δ4 happens
 *    to also arrive as `chg4` in the payload; we compute our own so all
 *    four periods are consistent and available even if a payload field
 *    is missing).
 *  - rank, by mrs descending, and how many places it moved vs last week.
 *  - the focus star: `stage == 2 AND mrs > 0 AND Δ4 > 0 AND Δ13 > 0`
 *    (BRIEF.md §7.2's own words: "a small configurable function... I
 *    will refine the money-flow part later").
 *
 * §16's "1W price" (the sector index's own % change) and traded value
 * need data this function doesn't have (provider price history,
 * constituent lists) - those are layered on separately in
 * `lib/db/sector-metrics-orchestrator.ts` so this core ranking logic
 * stays pure and fully unit-testable.
 */

import type { Stage } from "./weinstein";

export interface SnapshotLite {
  weekEnding: string; // yyyy-mm-dd
  stage: Stage | null;
  mrs: number | null;
}

export interface RankedSectorMetrics {
  sector: string;
  weekEnding: string;
  stage: Stage | null;
  mrs: number | null;
  delta4: number | null;
  delta13: number | null;
  delta26: number | null;
  delta52: number | null;
  rank: number | null;
  rankMove1w: number | null;
  rsChg1w: number | null;
  isFocus: boolean;
}

export const FOCUS_RULE_WEEKS = { shortTerm: 4, mediumTerm: 13 } as const;

/** Default focus rule, BRIEF.md §7.2 - kept as its own function so the money-flow refinement has a clean seam. */
export function isFocusSector(params: {
  stage: Stage | null;
  mrs: number | null;
  delta4: number | null;
  delta13: number | null;
}): boolean {
  return (
    params.stage === 2 &&
    params.mrs !== null &&
    params.mrs > 0 &&
    params.delta4 !== null &&
    params.delta4 > 0 &&
    params.delta13 !== null &&
    params.delta13 > 0
  );
}

function subtractWeeks(weekEnding: string, weeks: number): string {
  const [y, m, d] = weekEnding.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - weeks * 7);
  return date.toISOString().slice(0, 10);
}

/** The snapshot at or before `targetWeek`, closest first - tolerates a missed week rather than requiring an exact date match. */
function snapshotAtOrBefore(
  history: SnapshotLite[],
  targetWeek: string,
): SnapshotLite | null {
  const candidates = history.filter((s) => s.weekEnding <= targetWeek);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, s) => (s.weekEnding > latest.weekEnding ? s : latest));
}

function deltaAt(history: SnapshotLite[], currentMrs: number | null, weekEnding: string, weeksBack: number): number | null {
  if (currentMrs === null) return null;
  const past = snapshotAtOrBefore(history, subtractWeeks(weekEnding, weeksBack));
  if (!past || past.mrs === null || past.weekEnding === weekEnding) return null;
  return currentMrs - past.mrs;
}

/**
 * Ranks every sector for one market/week from each sector's own snapshot
 * history. `historyBySector` should include the current week's snapshot
 * in each sector's array (it's used both as "today" and as a lookback
 * source for other sectors' deltas, which never happens, but keeps the
 * caller's data-shape simple: just "everything stored for this sector").
 */
export function computeSectorRanking(
  historyBySector: Record<string, SnapshotLite[]>,
  weekEnding: string,
): RankedSectorMetrics[] {
  const previousWeekRankBySector = computePreviousWeekRanks(historyBySector, weekEnding);

  const rows: Omit<RankedSectorMetrics, "rank" | "rankMove1w">[] = Object.entries(historyBySector).map(
    ([sector, history]) => {
      const current = history.find((s) => s.weekEnding === weekEnding) ?? null;
      const mrs = current?.mrs ?? null;
      const stage = current?.stage ?? null;
      const delta4 = deltaAt(history, mrs, weekEnding, FOCUS_RULE_WEEKS.shortTerm);
      const delta13 = deltaAt(history, mrs, weekEnding, FOCUS_RULE_WEEKS.mediumTerm);
      const delta26 = deltaAt(history, mrs, weekEnding, 26);
      const delta52 = deltaAt(history, mrs, weekEnding, 52);

      const previousSnapshot = snapshotAtOrBefore(
        history.filter((s) => s.weekEnding < weekEnding),
        subtractWeeks(weekEnding, 1),
      );
      const rsChg1w = mrs !== null && previousSnapshot?.mrs != null ? mrs - previousSnapshot.mrs : null;

      return {
        sector,
        weekEnding,
        stage,
        mrs,
        delta4,
        delta13,
        delta26,
        delta52,
        rsChg1w,
        isFocus: isFocusSector({ stage, mrs, delta4, delta13 }),
      };
    },
  );

  const ranked = [...rows].sort((a, b) => {
    if (a.mrs === null) return 1;
    if (b.mrs === null) return -1;
    return b.mrs - a.mrs;
  });

  return ranked.map((row, index) => {
    const rank = row.mrs === null ? null : index + 1;
    const previousRank = previousWeekRankBySector.get(row.sector) ?? null;
    const rankMove1w = rank !== null && previousRank !== null ? previousRank - rank : null;
    return { ...row, rank, rankMove1w };
  });
}

function computePreviousWeekRanks(
  historyBySector: Record<string, SnapshotLite[]>,
  weekEnding: string,
): Map<string, number> {
  // Find the most recent snapshot date strictly before `weekEnding`, across
  // every sector, then rank whichever sectors reported that week.
  let previousWeek: string | null = null;
  for (const history of Object.values(historyBySector)) {
    for (const s of history) {
      if (s.weekEnding < weekEnding && (previousWeek === null || s.weekEnding > previousWeek)) {
        previousWeek = s.weekEnding;
      }
    }
  }
  if (previousWeek === null) return new Map();

  const rows = Object.entries(historyBySector)
    .map(([sector, history]) => ({
      sector,
      mrs: history.find((s) => s.weekEnding === previousWeek)?.mrs ?? null,
    }))
    .filter((r) => r.mrs !== null)
    .sort((a, b) => (b.mrs as number) - (a.mrs as number));

  return new Map(rows.map((r, i) => [r.sector, i + 1]));
}
