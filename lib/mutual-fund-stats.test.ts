import { describe, expect, it } from "vitest";
import { buildMutualFundView, monthLabel, shiftMonth } from "./mutual-fund-stats";
import type { MutualFundEntryRow } from "./db/schema-types";

function entry(overrides: Partial<MutualFundEntryRow> = {}): MutualFundEntryRow {
  return {
    id: crypto.randomUUID(),
    user_id: "u",
    month: "2026-01-01",
    amount_added: 0,
    current_value: 0,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("shiftMonth", () => {
  it("shifts forward within the same year", () => {
    expect(shiftMonth("2026-03-01", 2)).toBe("2026-05-01");
  });

  it("shifts backward across a year boundary", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("shifts back 12 months to the same month a year earlier", () => {
    expect(shiftMonth("2026-06-01", -12)).toBe("2025-06-01");
  });
});

describe("monthLabel", () => {
  it("formats a month string as a short month name and year", () => {
    expect(monthLabel("2026-03-01")).toBe("Mar 2026");
    expect(monthLabel("2019-12-01")).toBe("Dec 2019");
  });
});

describe("buildMutualFundView", () => {
  it("returns an all-null dashboard and empty groups for no entries", () => {
    const view = buildMutualFundView([]);
    expect(view.dashboard.totalInvested).toBeNull();
    expect(view.dashboard.currentValue).toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.byYear).toEqual([]);
  });

  it("derives cumulative invested as a running sum, never stored directly", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10200 }),
      entry({ month: "2026-02-01", amount_added: 5000, current_value: 15800 }),
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[0].cumulativeInvested).toBe(10000);
    expect(rows[1].cumulativeInvested).toBe(15000);
    expect(rows[1].gainAbs).toBe(800); // 15800 - 15000
    expect(rows[1].gainPct).toBeCloseTo((800 / 15000) * 100, 5);
  });

  it("dashboard reflects the latest month's totals", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 10000, current_value: 22000 }),
    ];
    const { dashboard } = buildMutualFundView(entries);
    expect(dashboard.latestMonth).toBe("2026-02-01");
    expect(dashboard.totalInvested).toBe(20000);
    expect(dashboard.currentValue).toBe(22000);
    expect(dashboard.gainAbs).toBe(2000);
    expect(dashboard.gainPct).toBeCloseTo(10, 5);
  });

  it("vsLastMonth compares against the exact previous calendar month, not just array order", () => {
    const entries = [
      entry({ month: "2026-01-01", current_value: 10000 }),
      // February skipped entirely.
      entry({ month: "2026-03-01", current_value: 11000 }),
    ];
    const { dashboard } = buildMutualFundView(entries);
    expect(dashboard.vsLastMonth).toBeNull(); // no Feb entry to compare against
  });

  it("vsLastMonth and vsLastYear compute both when the matching months exist", () => {
    const entries = [
      entry({ month: "2025-06-01", current_value: 50000 }),
      entry({ month: "2026-05-01", current_value: 90000 }),
      entry({ month: "2026-06-01", current_value: 100000 }),
    ];
    const { dashboard } = buildMutualFundView(entries);
    expect(dashboard.vsLastMonth!.valueChangeAbs).toBe(10000);
    expect(dashboard.vsLastMonth!.valueChangePct).toBeCloseTo((10000 / 90000) * 100, 5);
    expect(dashboard.vsLastYear!.valueChangeAbs).toBe(50000);
    expect(dashboard.vsLastYear!.valueChangePct).toBeCloseTo(100, 5); // doubled
  });

  it("groups entries by year, most recent year first, and sums that year's contributions", () => {
    const entries = [
      entry({ month: "2019-01-01", amount_added: 5000, current_value: 5000 }),
      entry({ month: "2019-06-01", amount_added: 5000, current_value: 10500 }),
      entry({ month: "2020-01-01", amount_added: 7000, current_value: 18000 }),
    ];
    const { byYear } = buildMutualFundView(entries);
    expect(byYear.map((y) => y.year)).toEqual(["2020", "2019"]);
    const y2019 = byYear.find((y) => y.year === "2019")!;
    expect(y2019.yearInvested).toBe(10000);
    expect(y2019.yearEndValue).toBe(10500);
    expect(y2019.rows).toHaveLength(2);
  });
});
