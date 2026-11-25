/**
 * Pure math for the Mutual Fund tracker (DECISIONS.md) - no I/O, so it's
 * unit-testable without a database. "Total invested to date" is never
 * stored; it's a running sum of every month's `amount_added` up to and
 * including that month. Month strings are always "yyyy-mm-01" and
 * compared/shifted with plain integer arithmetic, never `Date` objects -
 * the same reason as `lib/journal-calendar.ts`: a `Date`-based
 * computation that happens to be read back with local getters is a
 * latent timezone bug, so this avoids `Date` entirely instead.
 */

import type { MutualFundEntryRow } from "./db/schema-types";

export interface MutualFundEntryView {
  entry: MutualFundEntryRow;
  /** Every month's amount_added summed up to and including this one. */
  cumulativeInvested: number;
  gainAbs: number;
  /** Null when cumulativeInvested is 0 - nothing to divide by yet. */
  gainPct: number | null;
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
}

export interface MutualFundYearGroup {
  year: string;
  /** Oldest first within the year. */
  rows: MutualFundEntryView[];
  /** Sum of amount_added for months in this year - "how much I put in" that year. */
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

function periodChange(current: number, previous: number): PeriodChange {
  return {
    valueChangeAbs: current - previous,
    valueChangePct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export function buildMutualFundView(entries: MutualFundEntryRow[]): MutualFundView {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map<string, MutualFundEntryRow>();
  for (const e of sorted) byMonth.set(e.month, e);

  let running = 0;
  const rows: MutualFundEntryView[] = sorted.map((entry) => {
    running += entry.amount_added;
    const gainAbs = entry.current_value - running;
    const gainPct = running !== 0 ? (gainAbs / running) * 100 : null;
    return { entry, cumulativeInvested: running, gainAbs, gainPct };
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
      yearInvested: yearRows.reduce((sum, r) => sum + r.entry.amount_added, 0),
      yearEndValue: yearRows[yearRows.length - 1].entry.current_value,
    }))
    .sort((a, b) => (a.year < b.year ? 1 : -1));

  return { rows, dashboard, byYear };
}
