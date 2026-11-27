/**
 * Pure math for the US Trading Capital tracker (DECISIONS.md) - no I/O,
 * so it's unit-testable without a database. Structurally a leaner
 * sibling of `lib/mutual-fund-stats.ts`/`lib/nps-stats.ts`: no SIP/
 * Lumpsum/STP breakdown, no planned_amount, no Safe SWP, no goal
 * tracking, no CAGR, no benchmark overlay - none of those apply to a
 * swing-trading capital account. What this file computes, per month and
 * for the dashboard, is TWO independent annualized-return figures:
 *
 *  - `xirrPct` ("Annualized Return (USD)"): exactly the same XIRR
 *    mechanics as Mutual Funds/NPS, entirely in USD. Rupee movement
 *    after each deposit's conversion is explicitly out of scope for
 *    this figure - an explicit user choice (DECISIONS.md).
 *  - `realReturnPct` ("Real Return (FX-adjusted, INR)"): a second,
 *    independently-computed XIRR over an INR-denominated flow list -
 *    each month's deposit converted to INR using THAT MONTH's own rate
 *    (inr_amount directly if given, else amount_added * fx_rate), with
 *    the terminal value being the latest entry's current_value * ITS
 *    OWN value_fx_rate (today's rate). This is NOT the USD return
 *    rescaled by a single rate at the end - that would silently ignore
 *    that every deposit converted at a different historical rate, which
 *    is the whole point of a "real" (rupee) return. withdrawal is
 *    converted to INR using that same month's `fx_rate` (there's no
 *    separate withdrawal-specific rate field - withdrawals are rare/
 *    optional for this account type, and reusing fx_rate is the only
 *    rate available for that month's cash movements).
 *
 *    A month that has a nonzero amount_added but neither inr_amount nor
 *    fx_rate recorded, or a nonzero withdrawal with no fx_rate recorded,
 *    makes `realReturnPct` null from that month onward for every later
 *    month too (the running INR flow history is permanently missing a
 *    flow, same "coverage broken, stays broken" idiom as
 *    `computeBenchmarkSeries` in lib/mutual-fund-stats.ts) -
 *    `realReturnBlockedReason: "missing_deposit_data"` or
 *    `"missing_withdrawal_data"` respectively (distinct prompts for
 *    distinct fixes - the reason reported is whichever one FIRST broke
 *    coverage, remembered alongside the sticky flag, not recomputed
 *    fresh each row). A row whose own `value_fx_rate` is null (but every
 *    deposit/withdrawal up to and including it IS known) gets
 *    `realReturnBlockedReason: "missing_current_rate"`. When computeXirr
 *    itself returns null (not enough history to solve a rate, e.g. the
 *    very first month) with full data present, realReturnPct is simply
 *    null with no blocked reason - same generic "—" the USD xirrPct
 *    already uses in that case.
 */

import type { UsTradingCapitalEntryRow } from "./db/schema-types";
import { monthLabel, shiftMonth } from "./month-utils";
import { computeXirr, daysSinceEpoch } from "./xirr";

export { monthLabel, shiftMonth };

export type RealReturnBlockedReason = "missing_deposit_data" | "missing_withdrawal_data" | "missing_current_rate";

export interface UsTradingCapitalEntryView {
  entry: UsTradingCapitalEntryRow;
  /** Every month's amount_added summed up to and including this one - gross, never netted against withdrawal. */
  cumulativeAdded: number;
  /** Every month's (amount_added - withdrawal) summed up to and including this one. */
  cumulativeInvested: number;
  gainAbs: number;
  /** Null when cumulativeInvested is 0 - nothing to divide by yet. */
  gainPct: number | null;
  /** Annualized XIRR (%) as of this month, entirely in USD. Null when there isn't yet enough history to solve a rate from. */
  xirrPct: number | null;
  /** FX-adjusted annualized return (%) as of this month, entirely in INR. Null when blocked (see `realReturnBlockedReason`) or when there isn't yet enough history to solve a rate from. */
  realReturnPct: number | null;
  /** Why realReturnPct is null, when it's due to missing FX data rather than "not enough history yet." Null whenever realReturnPct has a value, or is null for the same generic reason xirrPct would be. */
  realReturnBlockedReason: RealReturnBlockedReason | null;
  /** This month's Gain minus the exact previous calendar month's Gain. Null when there's no entry for that exact prior month - never approximated. */
  pnlChangeAbs: number | null;
}

export interface PeriodChange {
  valueChangeAbs: number;
  /** Null when the comparison month's current_value was 0. */
  valueChangePct: number | null;
}

export interface UsTradingCapitalDashboard {
  latestMonth: string | null;
  totalInvested: number | null;
  currentValue: number | null;
  gainAbs: number | null;
  gainPct: number | null;
  /** Null when there's no entry for exactly one calendar month before latestMonth. */
  vsLastMonth: PeriodChange | null;
  /** Null when there's no entry for the same calendar month one year earlier. */
  vsLastYear: PeriodChange | null;
  /** Same figure as the latest row's xirrPct. */
  xirrPct: number | null;
  /** Same figure as the latest row's realReturnPct. */
  realReturnPct: number | null;
  /** Same figure as the latest row's realReturnBlockedReason. */
  realReturnBlockedReason: RealReturnBlockedReason | null;
}

export interface UsTradingCapitalYearGroup {
  year: string;
  /** Oldest first within the year. */
  rows: UsTradingCapitalEntryView[];
  /** Sum of (amount_added - withdrawal) for months in this year. */
  yearInvested: number;
  /** current_value of the year's last entry. */
  yearEndValue: number;
  /** Since-inception USD XIRR as of the year's last entry. */
  yearEndXirrPct: number | null;
  /** Since-inception Real Return as of the year's last entry. */
  yearEndRealReturnPct: number | null;
}

export interface UsTradingCapitalView {
  rows: UsTradingCapitalEntryView[];
  dashboard: UsTradingCapitalDashboard;
  /** Most recent year first. */
  byYear: UsTradingCapitalYearGroup[];
}

function periodChange(current: number, previous: number): PeriodChange {
  return {
    valueChangeAbs: current - previous,
    valueChangePct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

/**
 * The INR-equivalent of a USD flow this month: `inrAmount` directly when
 * given (it's the real, recorded figure - preferred over any derivation),
 * else `usdAmount * fxRate` when a rate is given, else null when the flow
 * is genuinely unconvertible. A zero USD amount never needs FX data at
 * all (a value-only check-in month with no new deposit).
 */
function resolveInrEquivalent(usdAmount: number, inrAmount: number | null, fxRate: number | null): number | null {
  if (usdAmount === 0) return 0;
  if (inrAmount !== null) return inrAmount;
  if (fxRate !== null) return usdAmount * fxRate;
  return null;
}

export function buildUsTradingCapitalView(entries: UsTradingCapitalEntryRow[]): UsTradingCapitalView {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map<string, UsTradingCapitalEntryRow>();
  for (const e of sorted) byMonth.set(e.month, e);

  let running = 0;
  let runningAdded = 0;
  const contributionFlows: Array<{ days: number; amount: number }> = [];
  const inrContributionFlows: Array<{ days: number; amount: number }> = [];
  let inrCoverageBroken = false;
  let inrCoverageBrokenReason: "missing_deposit_data" | "missing_withdrawal_data" | null = null;

  const rows: UsTradingCapitalEntryView[] = sorted.map((entry) => {
    running += entry.amount_added - entry.withdrawal;
    runningAdded += entry.amount_added;
    const gainAbs = entry.current_value - running;
    // "% return on capital" is only meaningful against a POSITIVE net
    // invested base - at 0 it's undefined, and if a withdrawal has pushed
    // it negative, dividing by a negative base inverts the sign (a real
    // gain would show as a large negative %). Null in both cases, never a
    // guessed/inverted number.
    const gainPct = running > 0 ? (gainAbs / running) * 100 : null;

    const days = daysSinceEpoch(entry.month);

    // USD-only XIRR - unchanged mechanics from Mutual Funds/NPS.
    contributionFlows.push({ days, amount: entry.withdrawal - entry.amount_added });
    const xirrRaw = computeXirr([...contributionFlows, { days, amount: entry.current_value }]);
    const xirrPct = xirrRaw !== null ? xirrRaw * 100 : null;

    // Real Return - independently-tracked INR flow history.
    const inrDeposit = resolveInrEquivalent(entry.amount_added, entry.inr_amount, entry.fx_rate);
    const inrWithdrawal = resolveInrEquivalent(entry.withdrawal, null, entry.fx_rate);
    if (!inrCoverageBroken) {
      if (inrDeposit === null) {
        inrCoverageBroken = true;
        inrCoverageBrokenReason = "missing_deposit_data";
      } else if (inrWithdrawal === null) {
        inrCoverageBroken = true;
        inrCoverageBrokenReason = "missing_withdrawal_data";
      }
    }

    let realReturnPct: number | null = null;
    let realReturnBlockedReason: RealReturnBlockedReason | null = null;
    if (inrCoverageBroken) {
      realReturnBlockedReason = inrCoverageBrokenReason;
    } else {
      inrContributionFlows.push({ days, amount: inrWithdrawal! - inrDeposit! });
      if (entry.value_fx_rate === null) {
        realReturnBlockedReason = "missing_current_rate";
      } else {
        const terminalInr = entry.current_value * entry.value_fx_rate;
        const realRaw = computeXirr([...inrContributionFlows, { days, amount: terminalInr }]);
        realReturnPct = realRaw !== null ? realRaw * 100 : null;
      }
    }

    return {
      entry,
      cumulativeAdded: runningAdded,
      cumulativeInvested: running,
      gainAbs,
      gainPct,
      xirrPct,
      realReturnPct,
      realReturnBlockedReason,
    };
  }).map((row, i, all) => {
    const prior = byMonth.has(shiftMonth(row.entry.month, -1)) ? all[i - 1] : undefined;
    return { ...row, pnlChangeAbs: prior ? row.gainAbs - prior.gainAbs : null };
  });

  let dashboard: UsTradingCapitalDashboard;
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
      realReturnPct: null,
      realReturnBlockedReason: null,
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
      realReturnPct: latest.realReturnPct,
      realReturnBlockedReason: latest.realReturnBlockedReason,
    };
  }

  const yearsMap = new Map<string, UsTradingCapitalEntryView[]>();
  for (const row of rows) {
    const year = row.entry.month.slice(0, 4);
    const list = yearsMap.get(year) ?? [];
    list.push(row);
    yearsMap.set(year, list);
  }
  const byYear: UsTradingCapitalYearGroup[] = Array.from(yearsMap.entries())
    .map(([year, yearRows]) => ({
      year,
      rows: yearRows,
      yearInvested: yearRows.reduce((sum, r) => sum + r.entry.amount_added - r.entry.withdrawal, 0),
      yearEndValue: yearRows[yearRows.length - 1].entry.current_value,
      yearEndXirrPct: yearRows[yearRows.length - 1].xirrPct,
      yearEndRealReturnPct: yearRows[yearRows.length - 1].realReturnPct,
    }))
    .sort((a, b) => (a.year < b.year ? 1 : -1));

  return { rows, dashboard, byYear };
}

/**
 * `inr_amount / fx_rate`, rounded to 2dp - the add-entry form's auto-fill
 * default for `amount_added` when both are given, always overridable
 * (deposits don't always convert at a clean rate). Null when either input
 * isn't a usable number, or fx_rate isn't positive.
 */
export function convertInrToUsd(inrAmount: number, fxRate: number): number | null {
  if (!Number.isFinite(inrAmount) || !Number.isFinite(fxRate) || fxRate <= 0) return null;
  return Math.round((inrAmount / fxRate) * 100) / 100;
}
