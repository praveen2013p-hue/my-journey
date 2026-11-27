/**
 * Pure math for the NPS tracker (DECISIONS.md) - no I/O, so it's
 * unit-testable without a database. Structurally identical to
 * `lib/mutual-fund-stats.ts` - see that file's comments for the full
 * reasoning (withdrawal nets out of cumulative invested, planned_amount
 * never enters the math, month strings are plain "yyyy-mm-01" integer
 * arithmetic via `lib/month-utils.ts`, never a `Date` object).
 */

import type { NpsEntryRow } from "./db/schema-types";
import { monthLabel, shiftMonth } from "./month-utils";
import { computeXirr, daysSinceEpoch } from "./xirr";

export { monthLabel, shiftMonth };

export interface NpsEntryView {
  entry: NpsEntryRow;
  /** Every month's amount_added summed up to and including this one - gross, never netted against withdrawal. "How much of my own money have I put in, in total." */
  cumulativeAdded: number;
  /** Every month's (amount_added - withdrawal) summed up to and including this one. */
  cumulativeInvested: number;
  gainAbs: number;
  /** Null when cumulativeInvested is 0 - nothing to divide by yet. */
  gainPct: number | null;
  /**
   * Annualized XIRR (%) as of this month - built from every month's net
   * contribution up to and including this one, plus this month's
   * current_value as the terminal "if I cashed out now" flow. Null when
   * there isn't yet at least one contribution and one point of growth/
   * loss to solve a rate from (e.g. the very first month, invested and
   * valued on the same day).
   */
  xirrPct: number | null;
  /** This month's Gain minus the exact previous calendar month's Gain - "how much the profit/loss moved this month." Null when there's no entry for that exact prior month (a skipped month, or this is the first one) - never approximated. */
  pnlChangeAbs: number | null;
  /**
   * "Safe SWP," DECISIONS.md - the classic "4% rule": 4% of this
   * month's own current_value per year, divided into a monthly amount.
   * Recalculated fresh against each month's own value, not a one-time
   * plan solved for a target age - matches how the withdrawal rate is
   * commonly understood in practice.
   */
  safeSwpMonthly: number;
}

export interface PeriodChange {
  valueChangeAbs: number;
  /** Null when the comparison month's current_value was 0. */
  valueChangePct: number | null;
}

export interface NpsDashboard {
  latestMonth: string | null;
  totalInvested: number | null;
  currentValue: number | null;
  gainAbs: number | null;
  gainPct: number | null;
  /** Null when there's no entry for exactly one calendar month before latestMonth - never approximated from whatever entry happens to be previous. */
  vsLastMonth: PeriodChange | null;
  /** Null when there's no entry for the same calendar month one year earlier. */
  vsLastYear: PeriodChange | null;
  /** Same figure as the latest row's xirrPct - the "final" overall XIRR, as of the latest month. */
  xirrPct: number | null;
  /** Same figure as the latest row's safeSwpMonthly - the classic 4% rule against the latest current_value. Null only when there are no entries yet. */
  safeSwpMonthly: number | null;
}

export interface NpsYearGroup {
  year: string;
  /** Oldest first within the year. */
  rows: NpsEntryView[];
  /** Sum of (amount_added - withdrawal) for months in this year - net "how much I put in" that year. */
  yearInvested: number;
  /** current_value of the year's last entry. */
  yearEndValue: number;
  /** Since-inception XIRR as of the year's last entry - "that year's return." Null under the same conditions as NpsEntryView.xirrPct. */
  yearEndXirrPct: number | null;
}

export interface NpsView {
  rows: NpsEntryView[];
  dashboard: NpsDashboard;
  /** Most recent year first. */
  byYear: NpsYearGroup[];
}

/**
 * "Safe SWP" column, DECISIONS.md: the classic "4% rule" (Bengen/Trinity-
 * study safe withdrawal rate) - 4% of the CURRENT portfolio value per
 * year. Recalculated fresh every month against that month's own value,
 * not a one-time plan solved for a target age - this is how the rate is
 * commonly understood and applied in practice.
 */
const SWP_ANNUAL_RATE_PCT = 4;

function periodChange(current: number, previous: number): PeriodChange {
  return {
    valueChangeAbs: current - previous,
    valueChangePct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

function computeSafeSwpMonthly(currentValue: number): number {
  return (currentValue * (SWP_ANNUAL_RATE_PCT / 100)) / 12;
}

export function buildNpsView(entries: NpsEntryRow[]): NpsView {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map<string, NpsEntryRow>();
  for (const e of sorted) byMonth.set(e.month, e);

  let running = 0;
  let runningAdded = 0;
  const contributionFlows: Array<{ days: number; amount: number }> = [];
  const rows: NpsEntryView[] = sorted.map((entry) => {
    running += entry.amount_added - entry.withdrawal;
    runningAdded += entry.amount_added;
    const gainAbs = entry.current_value - running;
    // "% return on capital" is only meaningful against a POSITIVE net
    // invested base - at 0 it's undefined, and if a withdrawal has pushed
    // it negative, dividing by a negative base inverts the sign (a real
    // gain would show as a large negative %). Null in both cases, never a
    // guessed/inverted number.
    const gainPct = running > 0 ? (gainAbs / running) * 100 : null;

    // A contribution is cash leaving the investor's pocket (negative);
    // a withdrawal is cash coming back (positive) - the opposite sign
    // from how amount_added/withdrawal affect cumulativeInvested above.
    const days = daysSinceEpoch(entry.month);
    contributionFlows.push({ days, amount: entry.withdrawal - entry.amount_added });
    const xirrPct = computeXirr([...contributionFlows, { days, amount: entry.current_value }]);

    const xirrPctFinal = xirrPct !== null ? xirrPct * 100 : null;

    return {
      entry,
      cumulativeAdded: runningAdded,
      cumulativeInvested: running,
      gainAbs,
      gainPct,
      xirrPct: xirrPctFinal,
      safeSwpMonthly: computeSafeSwpMonthly(entry.current_value),
    };
  }).map((row, i, all) => {
    const prior = byMonth.has(shiftMonth(row.entry.month, -1)) ? all[i - 1] : undefined;
    return { ...row, pnlChangeAbs: prior ? row.gainAbs - prior.gainAbs : null };
  });

  let dashboard: NpsDashboard;
  if (rows.length === 0) {
    dashboard = {
      latestMonth: null,
      totalInvested: null,
      currentValue: null,
      gainAbs: null,
      gainPct: null,
      vsLastMonth: null,
      vsLastYear: null,
      xirrPct: null,
      safeSwpMonthly: null,
    };
  } else {
    const latest = rows[rows.length - 1];
    const lastMonthEntry = byMonth.get(shiftMonth(latest.entry.month, -1)) ?? null;
    const lastYearEntry = byMonth.get(shiftMonth(latest.entry.month, -12)) ?? null;
    dashboard = {
      latestMonth: latest.entry.month,
      totalInvested: latest.cumulativeInvested,
      currentValue: latest.entry.current_value,
      gainAbs: latest.gainAbs,
      gainPct: latest.gainPct,
      vsLastMonth: lastMonthEntry ? periodChange(latest.entry.current_value, lastMonthEntry.current_value) : null,
      vsLastYear: lastYearEntry ? periodChange(latest.entry.current_value, lastYearEntry.current_value) : null,
      xirrPct: latest.xirrPct,
      safeSwpMonthly: latest.safeSwpMonthly,
    };
  }

  const yearsMap = new Map<string, NpsEntryView[]>();
  for (const row of rows) {
    const year = row.entry.month.slice(0, 4);
    const list = yearsMap.get(year) ?? [];
    list.push(row);
    yearsMap.set(year, list);
  }
  const byYear: NpsYearGroup[] = Array.from(yearsMap.entries())
    .map(([year, yearRows]) => ({
      year,
      rows: yearRows,
      yearInvested: yearRows.reduce((sum, r) => sum + r.entry.amount_added - r.entry.withdrawal, 0),
      yearEndValue: yearRows[yearRows.length - 1].entry.current_value,
      yearEndXirrPct: yearRows[yearRows.length - 1].xirrPct,
    }))
    .sort((a, b) => (a.year < b.year ? 1 : -1));

  return { rows, dashboard, byYear };
}
