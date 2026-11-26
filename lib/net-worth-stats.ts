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
}

export interface NetWorthBreakdownRow {
  name: string;
  kind: NetWorthEntityKind;
  currentValue: number;
  invested: number;
  gainAbs: number;
  gainPct: number | null;
  xirrPct: number | null;
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

export function computeNetWorthDashboard(entities: NetWorthEntity[]): NetWorthDashboard {
  const withEntries = entities.filter((e) => e.dashboard.latestMonth !== null);
  if (withEntries.length === 0) {
    return { currentValue: 0, totalInvested: 0, gainAbs: 0, gainPct: null, xirrPct: null, latestMonth: null };
  }

  const currentValue = withEntries.reduce((sum, e) => sum + (e.dashboard.currentValue ?? 0), 0);
  const totalInvested = withEntries.reduce((sum, e) => sum + (e.dashboard.totalInvested ?? 0), 0);
  const gainAbs = currentValue - totalInvested;
  const gainPct = totalInvested !== 0 ? (gainAbs / totalInvested) * 100 : null;

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
  return { currentValue, totalInvested, gainAbs, gainPct, xirrPct: rate !== null ? rate * 100 : null, latestMonth: terminalMonth };
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
