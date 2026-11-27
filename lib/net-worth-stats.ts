/**
 * Pure math for the combined "Net Worth" view (DECISIONS.md): every
 * Mutual Fund profile (every family member) plus NPS, pooled into one
 * consolidated picture. No I/O - takes already-built per-entity
 * dashboards/rows (from `buildMutualFundView`/`buildNpsView`) as input,
 * so it never re-derives anything those already computed.
 *
 * `NetWorthEntity` only requires the structural shape shared by
 * `MutualFundDashboard`/`NpsDashboard` and `MutualFundEntryView`/
 * `NpsEntryView` - deliberately not importing either type, so this stays
 * decoupled from which tracker an entity actually came from.
 */

import { computeXirr, daysSinceEpoch, type CashFlow } from "./xirr";
import {
  computeSafeSwpMonthly,
  computeSafeSwpSustainYears,
  periodChange,
  shiftMonth,
  type PeriodChange,
  type SafeSwpSustainProjection,
} from "./mutual-fund-stats";

export type NetWorthEntityKind = "mutual_fund" | "nps";

interface NetWorthDashboardLike {
  latestMonth: string | null;
  totalInvested: number | null;
  currentValue: number | null;
  gainAbs: number | null;
  gainPct: number | null;
  xirrPct: number | null;
}

interface NetWorthRowLike {
  entry: {
    month: string;
    amount_added: number;
    withdrawal: number;
    current_value: number;
  };
  cumulativeInvested: number;
}

export interface NetWorthEntity {
  name: string;
  kind: NetWorthEntityKind;
  dashboard: NetWorthDashboardLike;
  /** Oldest first - same ordering `buildMutualFundView`/`buildNpsView` already produce. */
  rows: NetWorthRowLike[];
  /** Where clicking this entity's name in the breakdown table should go - that profile's Mutual Funds page, or NPS. */
  href: string;
}

export interface NetWorthBreakdownRow {
  name: string;
  kind: NetWorthEntityKind;
  currentValue: number;
  invested: number;
  gainAbs: number;
  gainPct: number | null;
  xirrPct: number | null;
  href: string;
}

export interface NetWorthDashboard {
  currentValue: number;
  totalInvested: number;
  gainAbs: number;
  /** Null when totalInvested is 0 - nothing to divide by yet. */
  gainPct: number | null;
  /**
   * Pooled XIRR across every entity's entire cash-flow history, solved
   * from ONE combined flow list, never an average of the individual
   * entities' own XIRRs (that would ignore how much capital and timing
   * each one actually represents). Every entity's own contribution/
   * withdrawal flows go in at their own dates; the combined terminal
   * value is a single flow, dated at the latest month any entity has an
   * entry for, equal to the sum of every entity's own latest known
   * current_value as of that month (forward-filled for an entity whose
   * own latest entry is earlier - it still holds that value, it just
   * hasn't been re-entered yet this month). Null under the same
   * conditions `computeXirr` already returns null for (e.g. only one
   * entity, one month old, invested and valued the same day).
   */
  xirrPct: number | null;
  /** The latest month any entity has an entry for - null only when nothing has been entered anywhere yet. */
  latestMonth: string | null;
  /** 4% of the combined currentValue per year, as a monthly amount - same classic 4% rule each tracker already shows. */
  safeSwpMonthly: number;
  /** How many years that Safe SWP amount (frozen at today's figure) would sustain the combined corpus, projected at the combined XIRR - see `computeSafeSwpSustainYears`. */
  safeSwpSustain: SafeSwpSustainProjection;
  /**
   * How much the WHOLE combined portfolio (every Mutual Fund profile +
   * NPS) changed vs one calendar month/year before latestMonth. Unlike
   * each entity's own `vsLastMonth`/`vsLastYear` (which require an EXACT
   * entry for that entity at that exact prior month, else null), this
   * pools each entity's forward-filled value at that date - an entity
   * that hasn't re-entered this specific month yet still holds its last
   * known value, same convention as `computeNetWorthWealthSeries`'s chart
   * series and the terminal-value calc above. Null only when NO entity
   * had any entry at all as of that comparison date (nothing to compare
   * against yet) - an entity that simply hadn't started yet (e.g. US
   * Trading Capital opened mid-year) correctly contributes 0 to that
   * earlier total rather than being excluded, since that's a real part of
   * how the combined portfolio grew.
   */
  vsLastMonth: PeriodChange | null;
  vsLastYear: PeriodChange | null;
}

export interface NetWorthWealthPoint {
  month: string;
  invested: number;
  value: number;
}

export interface NetWorthView {
  dashboard: NetWorthDashboard;
  /** Same order entities were passed in. */
  breakdown: NetWorthBreakdownRow[];
  /** Union of every entity's months, oldest first. */
  chartPoints: NetWorthWealthPoint[];
}

function latestRowAtOrBefore(rows: NetWorthRowLike[], month: string): NetWorthRowLike | undefined {
  // `rows` is already ascending by month (guaranteed by buildMutualFundView/
  // buildNpsView), so the last element still <= month is simply the last
  // match in a plain filter - no re-sort needed.
  const atOrBefore = rows.filter((r) => r.entry.month <= month);
  return atOrBefore[atOrBefore.length - 1];
}

/**
 * Sum of every entity's forward-filled `current_value` as of `month` - an
 * entity with no entry at or before `month` contributes 0 (it genuinely
 * didn't hold any value yet, e.g. not opened yet), UNLESS *no* entity has
 * any entry at or before `month`, in which case there's nothing to compare
 * against at all and this returns null.
 */
function combinedValueAtOrBefore(entities: NetWorthEntity[], month: string): number | null {
  let anyData = false;
  let total = 0;
  for (const e of entities) {
    const row = latestRowAtOrBefore(e.rows, month);
    if (row) {
      anyData = true;
      total += row.entry.current_value;
    }
  }
  return anyData ? total : null;
}

export function computeNetWorthDashboard(entities: NetWorthEntity[]): NetWorthDashboard {
  const withEntries = entities.filter((e) => e.dashboard.latestMonth !== null);
  if (withEntries.length === 0) {
    return {
      currentValue: 0,
      totalInvested: 0,
      gainAbs: 0,
      gainPct: null,
      xirrPct: null,
      latestMonth: null,
      safeSwpMonthly: 0,
      safeSwpSustain: { status: "no_capital" },
      vsLastMonth: null,
      vsLastYear: null,
    };
  }

  const currentValue = withEntries.reduce((sum, e) => sum + (e.dashboard.currentValue ?? 0), 0);
  const totalInvested = withEntries.reduce((sum, e) => sum + (e.dashboard.totalInvested ?? 0), 0);
  const gainAbs = currentValue - totalInvested;
  // "% return on capital" is only meaningful against a POSITIVE net
  // invested base - at 0 it's undefined, and if withdrawals have pushed it
  // negative, dividing by a negative base inverts the sign (a real gain
  // would show as a large negative %). Null in both cases, never a
  // guessed/inverted number - same fix as the per-entity dashboards this pools.
  const gainPct = totalInvested > 0 ? (gainAbs / totalInvested) * 100 : null;

  const terminalMonth = withEntries.reduce(
    (latest, e) => (e.dashboard.latestMonth! > latest ? e.dashboard.latestMonth! : latest),
    withEntries[0].dashboard.latestMonth!,
  );

  const flows: CashFlow[] = [];
  for (const entity of withEntries) {
    for (const row of entity.rows) {
      flows.push({ days: daysSinceEpoch(row.entry.month), amount: row.entry.withdrawal - row.entry.amount_added });
    }
  }
  const terminalValue = withEntries.reduce((sum, e) => {
    const last = latestRowAtOrBefore(e.rows, terminalMonth);
    return sum + (last ? last.entry.current_value : 0);
  }, 0);
  flows.push({ days: daysSinceEpoch(terminalMonth), amount: terminalValue });

  const rate = computeXirr(flows);
  const xirrPct = rate !== null ? rate * 100 : null;

  const lastMonthValue = combinedValueAtOrBefore(withEntries, shiftMonth(terminalMonth, -1));
  const lastYearValue = combinedValueAtOrBefore(withEntries, shiftMonth(terminalMonth, -12));

  return {
    currentValue,
    totalInvested,
    gainAbs,
    gainPct,
    xirrPct,
    latestMonth: terminalMonth,
    safeSwpMonthly: computeSafeSwpMonthly(currentValue),
    safeSwpSustain: computeSafeSwpSustainYears(currentValue, xirrPct),
    vsLastMonth: lastMonthValue !== null ? periodChange(currentValue, lastMonthValue) : null,
    vsLastYear: lastYearValue !== null ? periodChange(currentValue, lastYearValue) : null,
  };
}

export function computeNetWorthBreakdown(entities: NetWorthEntity[]): NetWorthBreakdownRow[] {
  return entities.map((e) => ({
    name: e.name,
    kind: e.kind,
    currentValue: e.dashboard.currentValue ?? 0,
    invested: e.dashboard.totalInvested ?? 0,
    gainAbs: e.dashboard.gainAbs ?? 0,
    gainPct: e.dashboard.gainPct,
    xirrPct: e.dashboard.xirrPct,
    href: e.href,
  }));
}

/**
 * Combined "wealth growth" chart data: the union of every entity's
 * months, each entity's invested/value forward-filled to its own latest
 * known figures as of that month (NOT zero-filled) - a profile with no
 * entry yet that month still holds whatever it was last valued at, so
 * zero-filling would put a false dip in the combined line every time one
 * entity's entry lands a little later than another's.
 */
export function computeNetWorthWealthSeries(entities: NetWorthEntity[]): NetWorthWealthPoint[] {
  const months = new Set<string>();
  for (const e of entities) for (const r of e.rows) months.add(r.entry.month);
  const sortedMonths = Array.from(months).sort();

  return sortedMonths.map((month) => {
    let invested = 0;
    let value = 0;
    for (const e of entities) {
      const last = latestRowAtOrBefore(e.rows, month);
      if (last) {
        invested += last.cumulativeInvested;
        value += last.entry.current_value;
      }
    }
    return { month, invested, value };
  });
}

export function computeNetWorthView(entities: NetWorthEntity[]): NetWorthView {
  return {
    dashboard: computeNetWorthDashboard(entities),
    breakdown: computeNetWorthBreakdown(entities),
    chartPoints: computeNetWorthWealthSeries(entities),
  };
}
