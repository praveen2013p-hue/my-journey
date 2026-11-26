/**
 * Pure math for the Mutual Fund tracker (DECISIONS.md) - no I/O, so it's
 * unit-testable without a database. "Total invested to date" is never
 * stored; it's a running sum of every month's `amount_added` minus
 * `withdrawal` up to and including that month - a withdrawal is money
 * that's no longer in the fund, so it reduces net invested the same way
 * a contribution increases it. `planned_amount` never enters this math
 * at all; it's shown next to `amount_added` purely for comparison.
 * Month strings are always "yyyy-mm-01" and compared/shifted with plain
 * integer arithmetic, never `Date` objects - the same reason as
 * `lib/journal-calendar.ts`: a `Date`-based computation that happens to
 * be read back with local getters is a latent timezone bug, so this
 * avoids `Date` entirely instead.
 */

import type { MutualFundEntryRow } from "./db/schema-types";
import { monthLabel, shiftMonth } from "./month-utils";
import type { CashFlow } from "./xirr";
import { computeXirr, daysSinceEpoch } from "./xirr";

export { monthLabel, shiftMonth };

export interface MutualFundEntryView {
  entry: MutualFundEntryRow;
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
  /**
   * Trailing 1-year annualized return (%), anchored to the portfolio's
   * own value exactly 1 year before this month - NOT a naive slice of
   * the last 12 months' contributions (that would ignore compounding of
   * money already in the portfolio before the window). Null when there's
   * no entry for that exact calendar month (a gap, or under a year of
   * history) - never approximated. See `computeTrailingCagr`.
   */
  cagr1y: number | null;
  /** Same as cagr1y, anchored 3 years back. */
  cagr3y: number | null;
  /** Same as cagr1y, anchored 5 years back. */
  cagr5y: number | null;
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

export interface MutualFundDashboard {
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

export interface MutualFundYearGroup {
  year: string;
  /** Oldest first within the year. */
  rows: MutualFundEntryView[];
  /** Sum of (amount_added - withdrawal) for months in this year - net "how much I put in" that year. */
  yearInvested: number;
  /** current_value of the year's last entry. */
  yearEndValue: number;
  /** Since-inception XIRR as of the year's last entry - "that year's return." Null under the same conditions as MutualFundEntryView.xirrPct. */
  yearEndXirrPct: number | null;
}

export interface MutualFundView {
  rows: MutualFundEntryView[];
  dashboard: MutualFundDashboard;
  /** Most recent year first. */
  byYear: MutualFundYearGroup[];
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

/**
 * Trailing N-year CAGR as of `targetMonth`, solved via the same XIRR
 * engine as the since-inception figure (`lib/xirr.ts`) - not a second
 * solver. Deliberately NOT a naive slice of the last N years' worth of
 * contribution flows: money already sitting in the portfolio before the
 * window started would then be invisible to the calculation, even
 * though it kept compounding right alongside everything else. Instead:
 * find the entry for EXACTLY `targetMonth` minus N years (null if there
 * isn't one - a gap, or less than N years of history, is never
 * approximated to "whatever entry happens to be close"), treat that
 * month's own current_value as a single starting outflow (as if a lump
 * sum equal to the portfolio's value back then were invested on that
 * date), then add every contribution/withdrawal flow strictly after
 * that month through `targetMonth`, and finally `targetMonth`'s own
 * current_value as the terminal inflow (same day as the last
 * contribution flow, matching the since-inception XIRR's convention).
 */
export function computeTrailingCagr(
  entries: MutualFundEntryRow[],
  targetMonth: string,
  years: number,
): number | null {
  const byMonth = new Map<string, MutualFundEntryRow>();
  for (const e of entries) byMonth.set(e.month, e);

  const targetEntry = byMonth.get(targetMonth);
  if (!targetEntry) return null;

  const startMonth = shiftMonth(targetMonth, -years * 12);
  const startEntry = byMonth.get(startMonth);
  if (!startEntry) return null;

  const flows: CashFlow[] = [{ days: daysSinceEpoch(startMonth), amount: -startEntry.current_value }];
  for (const e of [...entries].sort((a, b) => (a.month < b.month ? -1 : 1))) {
    if (e.month <= startMonth || e.month > targetMonth) continue;
    flows.push({ days: daysSinceEpoch(e.month), amount: e.withdrawal - e.amount_added });
  }
  flows.push({ days: daysSinceEpoch(targetMonth), amount: targetEntry.current_value });

  const rate = computeXirr(flows);
  return rate !== null ? rate * 100 : null;
}

export type GoalProjection =
  | { status: "reached" }
  | { status: "no_xirr" }
  | { status: "no_growth" }
  | { status: "projected"; months: number };

/**
 * Projected time-to-goal, DECISIONS.md - deliberately the most
 * conservative projection that doesn't require guessing anything about
 * the future: it assumes the portfolio's own latest since-inception
 * XIRR holds steady, and makes NO assumption about future contributions
 * (a SIP continuing, a lumpsum showing up, etc.) - if the user keeps
 * contributing, the real time-to-goal will only be shorter than this.
 *
 * Converts the annualized XIRR to an equivalent monthly compounding
 * rate - `monthlyRate = (1 + xirrPct/100)^(1/12) - 1` - then solves
 * `currentValue * (1 + monthlyRate)^months = goalAmount` for `months`:
 * `months = ln(goalAmount / currentValue) / ln(1 + monthlyRate)`.
 *
 * Every case that isn't a clean, forward-looking projection gets its own
 * explicit status instead of a guessed number - same "never approximate"
 * philosophy as `vsLastMonth`/`vsLastYear`/the CAGR figures above:
 * - `"reached"`: currentValue is already at or past the goal.
 * - `"no_xirr"`: there isn't a since-inception XIRR yet to project from
 *   (e.g. the very first month).
 * - `"no_growth"`: the monthly rate implied by the latest XIRR is zero
 *   or negative - projecting forward would mean "never," which isn't a
 *   number to show, it's its own explanatory state.
 * - `"projected"`: the only case with an actual number.
 */
export function computeGoalProjection(
  currentValue: number,
  goalAmount: number,
  xirrPct: number | null,
): GoalProjection {
  if (currentValue >= goalAmount) return { status: "reached" };
  if (xirrPct === null) return { status: "no_xirr" };

  const monthlyRate = Math.pow(1 + xirrPct / 100, 1 / 12) - 1;
  if (monthlyRate <= 0) return { status: "no_growth" };

  const months = Math.log(goalAmount / currentValue) / Math.log(1 + monthlyRate);
  return { status: "projected", months };
}

export function buildMutualFundView(entries: MutualFundEntryRow[]): MutualFundView {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map<string, MutualFundEntryRow>();
  for (const e of sorted) byMonth.set(e.month, e);

  let running = 0;
  let runningAdded = 0;
  const contributionFlows: Array<{ days: number; amount: number }> = [];
  const rows: MutualFundEntryView[] = sorted.map((entry) => {
    running += entry.amount_added - entry.withdrawal;
    runningAdded += entry.amount_added;
    const gainAbs = entry.current_value - running;
    const gainPct = running !== 0 ? (gainAbs / running) * 100 : null;

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
      cagr1y: computeTrailingCagr(sorted, entry.month, 1),
      cagr3y: computeTrailingCagr(sorted, entry.month, 3),
      cagr5y: computeTrailingCagr(sorted, entry.month, 5),
      safeSwpMonthly: computeSafeSwpMonthly(entry.current_value),
    };
  }).map((row, i, all) => {
    const prior = byMonth.has(shiftMonth(row.entry.month, -1)) ? all[i - 1] : undefined;
    return { ...row, pnlChangeAbs: prior ? row.gainAbs - prior.gainAbs : null };
  });

  let dashboard: MutualFundDashboard;
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

  const yearsMap = new Map<string, MutualFundEntryView[]>();
  for (const row of rows) {
    const year = row.entry.month.slice(0, 4);
    const list = yearsMap.get(year) ?? [];
    list.push(row);
    yearsMap.set(year, list);
  }
  const byYear: MutualFundYearGroup[] = Array.from(yearsMap.entries())
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
