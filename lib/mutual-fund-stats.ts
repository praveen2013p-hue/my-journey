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
import { computeXirr, daysSinceEpoch } from "./xirr";

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
   * The level monthly withdrawal that would run this month's current_value
   * down to exactly zero by age 90, assuming it keeps earning this
   * month's own XIRR the whole way - "Safe SWP," DECISIONS.md. Null
   * when it can't be computed: no birth year set, this month's XIRR
   * itself is undefined, or this point in time is already at or past 90.
   */
  safeSwpMonthly: number | null;
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
}

export interface MutualFundYearGroup {
  year: string;
  /** Oldest first within the year. */
  rows: MutualFundEntryView[];
  /** Sum of (amount_added - withdrawal) for months in this year - net "how much I put in" that year. */
  yearInvested: number;
  /** current_value of the year's last entry. */
  yearEndValue: number;
}

export interface MutualFundView {
  rows: MutualFundEntryView[];
  dashboard: MutualFundDashboard;
  /** Most recent year first. */
  byYear: MutualFundYearGroup[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-01" -> "Mar 2026" - string slicing, never a Date object. */
export function monthLabel(month: string): string {
  const year = month.slice(0, 4);
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[monthIndex] ?? "?"} ${year}`;
}

/** "yyyy-mm-01" shifted by `deltaMonths` (negative goes back) - pure integer arithmetic, no Date object. */
export function shiftMonth(month: string, deltaMonths: number): string {
  const year = Number(month.slice(0, 4));
  const zeroBasedMonth = Number(month.slice(5, 7)) - 1;
  const total = year * 12 + zeroBasedMonth + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12;
  return `${newYear}-${String(newMonth + 1).padStart(2, "0")}-01`;
}

/** "Safe SWP" column, DECISIONS.md: draws the portfolio down to zero by this age, never earlier - no legacy left on purpose. */
const SWP_TARGET_AGE = 90;

/**
 * Assumed long-run inflation, India CPI ballpark - used to convert the
 * raw (nominal) XIRR into a real rate before amortizing. Without this,
 * a high nominal XIRR projected flat for 50+ years produces a
 * withdrawal that's technically "drains to zero" but not realistic -
 * it ignores that a flat rupee amount buys less every year, and that
 * markets don't sustain high nominal returns without inflation being
 * part of why. DECISIONS.md: found via a real number looking too high.
 */
const ASSUMED_INFLATION_PCT = 6;

/** Fisher equation: the real (inflation-adjusted) rate behind a nominal one. */
export function realRatePct(nominalPct: number): number {
  return ((1 + nominalPct / 100) / (1 + ASSUMED_INFLATION_PCT / 100) - 1) * 100;
}

function periodChange(current: number, previous: number): PeriodChange {
  return {
    valueChangeAbs: current - previous,
    valueChangePct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

/**
 * Level monthly payment that exhausts `principal` after `months` payments
 * at a monthly rate `monthlyRate` - the standard loan/annuity amortization
 * formula, run "in reverse" (the fund pays the investor instead of the
 * other way around). A monthly rate of ~0 is treated as straight-line
 * division to avoid dividing by a near-zero number.
 */
export function amortizedPayment(principal: number, monthlyRate: number, months: number): number {
  if (Math.abs(monthlyRate) < 1e-9) return principal / months;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

/**
 * Months remaining from `month` until the given birth year turns
 * `SWP_TARGET_AGE` - only the birth *year* is known (not month/day), so
 * age is approximated as (that month's year - birth year). Null once
 * that age is already reached.
 */
export function monthsUntilTargetAge(month: string, birthYear: number): number | null {
  const ageAtMonth = Number(month.slice(0, 4)) - birthYear;
  const yearsRemaining = SWP_TARGET_AGE - ageAtMonth;
  return yearsRemaining > 0 ? yearsRemaining * 12 : null;
}

function computeSafeSwpMonthly(
  currentValue: number,
  annualRatePct: number | null,
  month: string,
  birthYear: number | null,
): number | null {
  if (birthYear === null || annualRatePct === null) return null;
  const monthlyRate = Math.pow(1 + realRatePct(annualRatePct) / 100, 1 / 12) - 1;
  if (!Number.isFinite(monthlyRate)) return null; // a rate <= -100% has no valid (1+r)^(1/12)
  const months = monthsUntilTargetAge(month, birthYear);
  if (months === null) return null;
  return amortizedPayment(currentValue, monthlyRate, months);
}

export function buildMutualFundView(entries: MutualFundEntryRow[], birthYear: number | null = null): MutualFundView {
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
      safeSwpMonthly: computeSafeSwpMonthly(entry.current_value, xirrPctFinal, entry.month, birthYear),
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
    }))
    .sort((a, b) => (a.year < b.year ? 1 : -1));

  return { rows, dashboard, byYear };
}
