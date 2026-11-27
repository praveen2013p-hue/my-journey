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

import { lookupBenchmarkLevel } from "./benchmark-index-data";
import type { MutualFundEntryRow } from "./db/schema-types";
import { monthLabel, shiftMonth } from "./month-utils";
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
export const SWP_ANNUAL_RATE_PCT = 4;

function periodChange(current: number, previous: number): PeriodChange {
  return {
    valueChangeAbs: current - previous,
    valueChangePct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export function computeSafeSwpMonthly(currentValue: number): number {
  return (currentValue * (SWP_ANNUAL_RATE_PCT / 100)) / 12;
}

export type SafeSwpSustainProjection =
  | { status: "no_capital" }
  | { status: "no_xirr" }
  | { status: "invalid_rate" }
  | { status: "indefinite" }
  | { status: "projected"; years: number };

/**
 * "Safe SWP sustains for N years," DECISIONS.md. The 4% rule itself is
 * recalculated fresh every month off whatever the corpus is then, so
 * under that rule it never actually hits zero - there's no "years until
 * depleted" to compute from it directly. This answers a different,
 * related question instead: freeze TODAY's Safe SWP amount as a fixed
 * annual withdrawal, project the remaining corpus forward at the
 * portfolio's own current XIRR, and solve for how many years until it's
 * gone - the standard retirement-withdrawal depletion formula.
 *
 * Closed form: withdrawing a fixed W = 4% * currentValue each year while
 * the remainder compounds at rate r gives
 *   corpus(t) = currentValue*(1+r)^t - W*[(1+r)^t - 1]/r
 * Solving corpus(t) = 0 for t:
 *   t = ln(W / (W - currentValue*r)) / ln(1 + r)
 *
 * Explicit states instead of a guessed/Infinity number, same philosophy
 * as `computeGoalProjection`:
 * - `"no_capital"`: currentValue is 0 or negative - nothing to sustain.
 * - `"no_xirr"`: no since-inception XIRR yet to project from.
 * - `"invalid_rate"`: an XIRR of -100% or worse (a total/over-wipeout) -
 *   `ln(1 + r)` is undefined, never a guessed number.
 * - `"indefinite"`: the current XIRR already meets or beats the 4%
 *   withdrawal rate, so under this fixed-withdrawal model the corpus
 *   never depletes (it holds steady or grows) - genuinely "forever,"
 *   not a huge-but-finite number.
 * - `"projected"`: the only case with an actual year count. `r === 0` is
 *   handled as its own branch (the general formula is 0/0 there) - a
 *   flat, non-compounding corpus funds a fixed 4% annual withdrawal for
 *   exactly 1/4% = 25 years, independent of the amount.
 */
export function computeSafeSwpSustainYears(currentValue: number, xirrPct: number | null): SafeSwpSustainProjection {
  if (currentValue <= 0) return { status: "no_capital" };
  if (xirrPct === null) return { status: "no_xirr" };

  const r = xirrPct / 100;
  const swpRate = SWP_ANNUAL_RATE_PCT / 100;
  if (r >= swpRate) return { status: "indefinite" };
  if (1 + r <= 0) return { status: "invalid_rate" };
  if (r === 0) return { status: "projected", years: 1 / swpRate };

  const annualWithdrawal = swpRate * currentValue;
  const years = Math.log(annualWithdrawal / (annualWithdrawal - currentValue * r)) / Math.log(1 + r);
  return { status: "projected", years };
}

export type GoalProjection =
  | { status: "reached" }
  | { status: "no_xirr" }
  | { status: "no_growth" }
  | { status: "no_capital" }
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
 * philosophy as `vsLastMonth`/`vsLastYear`:
 * - `"reached"`: currentValue is already at or past the goal.
 * - `"no_xirr"`: there isn't a since-inception XIRR yet to project from
 *   (e.g. the very first month).
 * - `"no_growth"`: the monthly rate implied by the latest XIRR is zero
 *   or negative - projecting forward would mean "never," which isn't a
 *   number to show, it's its own explanatory state.
 * - `"no_capital"`: currentValue is 0 or negative (e.g. a full withdrawal)
 *   while the goal is still unmet - `ln(goalAmount / currentValue)` would
 *   be undefined or infinite here, never a guessed/Infinity timeline.
 * - `"projected"`: the only case with an actual number.
 */
export function computeGoalProjection(
  currentValue: number,
  goalAmount: number,
  xirrPct: number | null,
): GoalProjection {
  if (currentValue >= goalAmount) return { status: "reached" };
  if (currentValue <= 0) return { status: "no_capital" };
  if (xirrPct === null) return { status: "no_xirr" };

  const monthlyRate = Math.pow(1 + xirrPct / 100, 1 / 12) - 1;
  if (monthlyRate <= 0) return { status: "no_growth" };

  const months = Math.log(goalAmount / currentValue) / Math.log(1 + monthlyRate);
  return { status: "projected", months };
}

export interface BenchmarkPoint {
  month: string;
  /**
   * Null when this month (or an earlier month that had a non-zero
   * contribution/withdrawal) falls outside the benchmark index table's
   * covered range - never extrapolated or approximated past that point.
   */
  value: number | null;
}

/**
 * "Did I beat the index" comparison line, DECISIONS.md (benchmark
 * overlay) - simulates putting the EXACT SAME monthly cash flows
 * (amount_added - withdrawal, same sign convention as cumulativeInvested)
 * into the benchmark index instead of the real portfolio: each month's
 * net flow "buys" `netFlow / indexLevelThatMonth` index units, and the
 * running unit holding is valued at each month's own index level. This
 * is an apples-to-apples comparison against the real contribution
 * history (not a naive ratio-scale of invested amounts, which would
 * ignore exactly when each rupee went in).
 *
 * `lookupLevel` defaults to the real `lookupBenchmarkLevel` table but is
 * injectable so tests can hand-verify the unit-purchase math against
 * simple, round index levels instead of the real (irregularly-spaced)
 * table values.
 */
export function computeBenchmarkSeries(
  entries: MutualFundEntryRow[],
  lookupLevel: (month: string) => number | null = lookupBenchmarkLevel,
): BenchmarkPoint[] {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));

  let units = 0;
  // Once a month with a real contribution/withdrawal falls outside the
  // index table's range, the running unit count can no longer be a
  // faithful simulation (that flow was never "invested" anywhere) - every
  // later month is null too, rather than silently understating the
  // comparison from a broken running total.
  let coverageBroken = false;

  return sorted.map((entry) => {
    const level = lookupLevel(entry.month);
    const netFlow = entry.amount_added - entry.withdrawal;

    if (level === null || level <= 0) {
      if (netFlow !== 0) coverageBroken = true;
      return { month: entry.month, value: null };
    }
    if (coverageBroken) {
      return { month: entry.month, value: null };
    }

    units += netFlow / level;
    return { month: entry.month, value: units * level };
  });
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
