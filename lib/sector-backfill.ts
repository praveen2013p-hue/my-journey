/**
 * Pure 2-year sector-index backfill engine, BRIEF.md §7.2: "Backfill on
 * first run: 2 years of weekly index history (plus 52 weeks warm-up for
 * RS)." Turns a sector's own weekly closes (plus a benchmark's, for
 * Mansfield RS) into the same stage/mrs/vsMa/chg4/focus shape a
 * TradingView alert sends, so Δ4/Δ13/Δ26/Δ52 trend math has real history
 * before any alert has fired. Kept provider/DB-free so it's fully
 * unit-testable - wiring lives in lib/db/sector-backfill-orchestrator.ts.
 *
 * Per §17.4, this never produces 'alert'-sourced rows and the orchestrator
 * never lets a backfilled week overwrite one that already came from a
 * real webhook.
 */

import { isFocusSector } from "./sector-metrics";
import { mansfieldRS, weinsteinStage, MA_PERIOD, SLOPE_LOOKBACK, MANSFIELD_RS_PERIOD, type Stage } from "./weinstein";

/** 2 years, BRIEF.md §7.2. */
export const BACKFILL_STORED_WEEKS = 104;
/** Mansfield RS's own 52-week SMA needs this much lookback before the first stored week. */
export const BACKFILL_WARMUP_WEEKS = MANSFIELD_RS_PERIOD;
/** Stage's 30-week MA (+ the slope lookback) needs its own lookback too, on top of the RS warm-up. */
const STAGE_PRE_WARMUP_WEEKS = MA_PERIOD + SLOPE_LOOKBACK;
/** Total weekly closes to fetch so every stored week has a real (non-null) stage and mrs where the data allows it. */
export const BACKFILL_FETCH_WEEKS = BACKFILL_STORED_WEEKS + BACKFILL_WARMUP_WEEKS + STAGE_PRE_WARMUP_WEEKS;

export interface WeeklyClose {
  weekEnding: string; // yyyy-mm-dd, oldest first
  close: number;
}

export interface BackfillWeekRow {
  weekEnding: string;
  stage: Stage | null;
  mrs: number | null;
  /** % above/below the 30W MA - same shape as an alert's pctAboveMA. */
  vsMa: number | null;
  /** mrs now minus mrs 4 weeks ago - same field name as the webhook payload's chg4. */
  chg4: number | null;
  focus: boolean;
}

/** Benchmark closes for just the weeks present in `closesSoFar`, in the same order - mansfieldRS zips by index, not by date. */
function alignToBenchmark(
  closesSoFar: WeeklyClose[],
  benchByWeek: Map<string, number>,
): { aligned: number[]; benchAligned: number[] } {
  const aligned: number[] = [];
  const benchAligned: number[] = [];
  for (const c of closesSoFar) {
    const bench = benchByWeek.get(c.weekEnding);
    if (bench === undefined) continue;
    aligned.push(c.close);
    benchAligned.push(bench);
  }
  return { aligned, benchAligned };
}

/**
 * `closes` must be oldest-first; only the most recent `BACKFILL_STORED_WEEKS`
 * are returned, but every earlier week is still used as lookback so the
 * first returned row isn't artificially starved of history. `benchCloses`
 * (also oldest-first) can be shorter, empty, or have gaps - any week
 * without a matching benchmark close just gets `mrs: null`, stage is
 * unaffected since it never looks at the benchmark.
 */
export function computeBackfillWeeks(
  closes: WeeklyClose[],
  benchCloses: WeeklyClose[],
): BackfillWeekRow[] {
  const benchByWeek = new Map(benchCloses.map((b) => [b.weekEnding, b.close]));
  const storedStart = Math.max(0, closes.length - BACKFILL_STORED_WEEKS);
  const rows: BackfillWeekRow[] = [];

  for (let i = storedStart; i < closes.length; i++) {
    const closesSoFar = closes.slice(0, i + 1);
    const { stage, ma } = weinsteinStage(closesSoFar.map((c) => c.close));

    const { aligned, benchAligned } = alignToBenchmark(closesSoFar, benchByWeek);
    const { mrs, delta } = mansfieldRS(aligned, benchAligned);

    const vsMa = ma !== null && ma !== 0 ? ((closes[i].close - ma) / ma) * 100 : null;

    rows.push({
      weekEnding: closes[i].weekEnding,
      stage,
      mrs,
      vsMa,
      chg4: delta.d4,
      focus: isFocusSector({ stage, mrs, delta4: delta.d4, delta13: delta.d13 }),
    });
  }

  return rows;
}
