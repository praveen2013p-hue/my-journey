import { describe, expect, it } from "vitest";
import {
  computeNetWorthBreakdown,
  computeNetWorthDashboard,
  computeNetWorthWealthSeries,
  type NetWorthEntity,
} from "./net-worth-stats";

function entity(
  name: string,
  kind: "mutual_fund" | "nps",
  rows: Array<{ month: string; amount_added: number; withdrawal?: number; current_value: number }>,
): NetWorthEntity {
  let cumulativeInvested = 0;
  const viewRows = rows.map((r) => {
    cumulativeInvested += r.amount_added - (r.withdrawal ?? 0);
    return {
      entry: { month: r.month, amount_added: r.amount_added, withdrawal: r.withdrawal ?? 0, current_value: r.current_value },
      cumulativeInvested,
    };
  });
  const latest = viewRows[viewRows.length - 1];
  return {
    name,
    kind,
    dashboard: {
      latestMonth: latest ? latest.entry.month : null,
      totalInvested: latest ? latest.cumulativeInvested : null,
      currentValue: latest ? latest.entry.current_value : null,
      gainAbs: latest ? latest.entry.current_value - latest.cumulativeInvested : null,
      gainPct: latest && latest.cumulativeInvested !== 0 ? ((latest.entry.current_value - latest.cumulativeInvested) / latest.cumulativeInvested) * 100 : null,
      xirrPct: null, // irrelevant to net-worth-stats - it pools raw flows, never reads this field
    },
    rows: viewRows,
  };
}

describe("computeNetWorthDashboard", () => {
  it("returns an all-zero, null dashboard when no entity has any entries", () => {
    const dashboard = computeNetWorthDashboard([entity("Self", "mutual_fund", []), entity("NPS", "nps", [])]);
    expect(dashboard).toEqual({ currentValue: 0, totalInvested: 0, gainAbs: 0, gainPct: null, xirrPct: null, latestMonth: null });
  });

  it("sums current value and invested across every entity", () => {
    const self = entity("Self", "mutual_fund", [{ month: "2024-01-01", amount_added: 100000, current_value: 100000 }]);
    const nps = entity("NPS", "nps", [{ month: "2024-01-01", amount_added: 50000, current_value: 50000 }]);
    const dashboard = computeNetWorthDashboard([self, nps]);
    expect(dashboard.totalInvested).toBe(150000);
    expect(dashboard.currentValue).toBe(150000);
    expect(dashboard.gainAbs).toBe(0);
  });

  it("hand-verified: pooled XIRR from two entities matches a single-entity XIRR built from the same combined flows", () => {
    // Self: invest 100000 on 2024-01-01, worth 110000 a year later.
    const self = entity("Self", "mutual_fund", [
      { month: "2024-01-01", amount_added: 100000, current_value: 100000 },
      { month: "2025-01-01", amount_added: 0, current_value: 110000 },
    ]);
    // NPS: invest 100000 on 2024-01-01 too, also worth 110000 a year later -
    // pooling two identical streams should give exactly the same XIRR as
    // either stream alone (10%), since doubling every flow changes nothing
    // about the rate that zeroes the combined NPV.
    const nps = entity("NPS", "nps", [
      { month: "2024-01-01", amount_added: 100000, current_value: 100000 },
      { month: "2025-01-01", amount_added: 0, current_value: 110000 },
    ]);
    const dashboard = computeNetWorthDashboard([self, nps]);
    expect(dashboard.currentValue).toBe(220000);
    expect(dashboard.totalInvested).toBe(200000);
    expect(dashboard.xirrPct).not.toBeNull();
    expect(dashboard.xirrPct!).toBeCloseTo(10, 0);
  });

  it("pools genuinely different cash-flow timing correctly, not as an average of individual XIRRs", () => {
    // Self: a single 100000 lump sum on 2024-01-01, doubled to 200000 by
    // 2025-01-01 (100% XIRR).
    const self = entity("Self", "mutual_fund", [
      { month: "2024-01-01", amount_added: 100000, current_value: 100000 },
      { month: "2025-01-01", amount_added: 0, current_value: 200000 },
    ]);
    // NPS: nine times as much capital (900000), flat (0% return).
    const nps = entity("NPS", "nps", [
      { month: "2024-01-01", amount_added: 900000, current_value: 900000 },
      { month: "2025-01-01", amount_added: 0, current_value: 900000 },
    ]);
    const dashboard = computeNetWorthDashboard([self, nps]);
    // A naive average of 100% and 0% would say 50%. The capital-weighted
    // truth: combined invested 1,000,000 -> combined terminal 1,100,000,
    // i.e. exactly 10% - the same arithmetic as the two-identical-streams
    // case above, just with uneven weights.
    expect(dashboard.xirrPct!).toBeCloseTo(10, 0);
    expect(dashboard.xirrPct!).not.toBeCloseTo(50, 0);
  });

  it("uses each entity's own latest month, forward-filling an entity that hasn't been updated as recently", () => {
    const self = entity("Self", "mutual_fund", [
      { month: "2024-01-01", amount_added: 100000, current_value: 100000 },
      { month: "2024-06-01", amount_added: 0, current_value: 105000 },
    ]);
    // NPS has no entry at all for 2024-06 yet - its 2024-01 value should
    // still count at the combined terminal month (2024-06), not drop out.
    const nps = entity("NPS", "nps", [{ month: "2024-01-01", amount_added: 50000, current_value: 50000 }]);
    const dashboard = computeNetWorthDashboard([self, nps]);
    expect(dashboard.latestMonth).toBe("2024-06-01");
    expect(dashboard.currentValue).toBe(155000); // 105000 + 50000, NPS forward-filled
  });
});

describe("computeNetWorthBreakdown", () => {
  it("returns one row per entity, each entity's own already-computed figures untouched", () => {
    const self = entity("Self", "mutual_fund", [{ month: "2024-01-01", amount_added: 100000, current_value: 120000 }]);
    const wife = entity("Wife", "mutual_fund", [{ month: "2024-01-01", amount_added: 50000, current_value: 45000 }]);
    const rows = computeNetWorthBreakdown([self, wife]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Self", kind: "mutual_fund", currentValue: 120000, invested: 100000, gainAbs: 20000 });
    expect(rows[1]).toMatchObject({ name: "Wife", kind: "mutual_fund", currentValue: 45000, invested: 50000, gainAbs: -5000 });
  });

  it("reports an entity with no entries as all zeros, not an error", () => {
    const empty = entity("Son", "mutual_fund", []);
    const rows = computeNetWorthBreakdown([empty]);
    expect(rows[0]).toMatchObject({ currentValue: 0, invested: 0, gainAbs: 0, gainPct: null, xirrPct: null });
  });
});

describe("computeNetWorthWealthSeries", () => {
  it("forward-fills a profile with a gap month rather than zero-filling it", () => {
    const self = entity("Self", "mutual_fund", [
      { month: "2024-01-01", amount_added: 100000, current_value: 100000 },
      { month: "2024-03-01", amount_added: 0, current_value: 110000 },
    ]);
    const nps = entity("NPS", "nps", [
      { month: "2024-01-01", amount_added: 50000, current_value: 50000 },
      { month: "2024-02-01", amount_added: 0, current_value: 52000 },
      { month: "2024-03-01", amount_added: 0, current_value: 54000 },
    ]);
    const series = computeNetWorthWealthSeries([self, nps]);
    expect(series.map((p) => p.month)).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
    // Feb: Self has no entry yet - forward-filled at its Jan value (100000), not 0.
    expect(series[1]).toEqual({ month: "2024-02-01", invested: 150000, value: 152000 });
    expect(series[2]).toEqual({ month: "2024-03-01", invested: 150000, value: 164000 });
  });

  it("returns an empty series when no entity has any entries", () => {
    expect(computeNetWorthWealthSeries([entity("Self", "mutual_fund", []), entity("NPS", "nps", [])])).toEqual([]);
  });
});
