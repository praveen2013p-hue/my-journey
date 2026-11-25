import { describe, expect, it } from "vitest";
import { buildNpsView } from "./nps-stats";
import type { NpsEntryRow } from "./db/schema-types";

function entry(overrides: Partial<NpsEntryRow> = {}): NpsEntryRow {
  return {
    id: crypto.randomUUID(),
    user_id: "u",
    month: "2026-01-01",
    amount_added: 0,
    sip_amount: null,
    lumpsum_amount: null,
    stp_amount: null,
    other_amount: null,
    withdrawal: 0,
    planned_amount: null,
    current_value: 0,
    notes: null,
    negative_amount_note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildNpsView", () => {
  it("returns an all-null dashboard and empty groups for no entries", () => {
    const view = buildNpsView([]);
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
    const { rows } = buildNpsView(entries);
    expect(rows[0].cumulativeInvested).toBe(10000);
    expect(rows[1].cumulativeInvested).toBe(15000);
    expect(rows[1].gainAbs).toBe(800); // 15800 - 15000
    expect(rows[1].gainPct).toBeCloseTo((800 / 15000) * 100, 5);
  });

  it("safeSwpMonthly is the classic 4% rule - 4% of that month's own current_value per year, divided into a monthly amount", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 1200000, current_value: 1200000 })];
    const { rows } = buildNpsView(entries);
    expect(rows[0].safeSwpMonthly).toBeCloseTo((1200000 * 0.04) / 12, 5); // 4,000
  });

  it("safeSwpMonthly is recalculated fresh each month against that month's own current_value, not a fixed plan", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 1000000, current_value: 1000000 }),
      entry({ month: "2026-02-01", amount_added: 0, current_value: 1100000 }),
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[0].safeSwpMonthly).toBeCloseTo((1000000 * 0.04) / 12, 5);
    expect(rows[1].safeSwpMonthly).toBeCloseTo((1100000 * 0.04) / 12, 5); // moves with the new value, not the first month's
  });

  it("safeSwpMonthly doesn't depend on XIRR at all - it's always computable", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 50000, current_value: 50000 })];
    const { rows } = buildNpsView(entries);
    expect(rows[0].xirrPct).toBeNull(); // first entry, same-day guard - no XIRR yet
    expect(rows[0].safeSwpMonthly).toBeCloseTo((50000 * 0.04) / 12, 5); // still computed
  });

  it("pnlChangeAbs is the exact-month-over-month change in Gain, null for the first entry", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10200 }), // gain = 200
      entry({ month: "2026-02-01", amount_added: 5000, current_value: 15800 }), // gain = 800
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[0].pnlChangeAbs).toBeNull();
    expect(rows[1].pnlChangeAbs).toBe(600); // 800 - 200
  });

  it("pnlChangeAbs is null when the prior calendar month has no entry - never approximated from an older one", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10200 }),
      // February skipped.
      entry({ month: "2026-03-01", amount_added: 0, current_value: 10500 }),
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[1].pnlChangeAbs).toBeNull();
  });

  it("a withdrawal reduces cumulative invested, since it's money no longer in the fund", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 0, withdrawal: 3000, current_value: 7500 }),
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[1].cumulativeInvested).toBe(7000); // 10000 - 3000
    expect(rows[1].gainAbs).toBe(500); // 7500 - 7000
  });

  it("cumulativeAdded is gross - unlike cumulativeInvested, a withdrawal never reduces it", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 5000, withdrawal: 3000, current_value: 12000 }),
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[1].cumulativeAdded).toBe(15000); // 10000 + 5000, withdrawal ignored
    expect(rows[1].cumulativeInvested).toBe(12000); // 15000 - 3000
  });

  it("planned_amount never affects cumulative invested or gain", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 5000, planned_amount: 10000, current_value: 5200 })];
    const { rows } = buildNpsView(entries);
    expect(rows[0].cumulativeInvested).toBe(5000);
    expect(rows[0].gainAbs).toBe(200);
  });

  it("dashboard reflects the latest month's totals", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 10000, current_value: 22000 }),
    ];
    const { dashboard } = buildNpsView(entries);
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
    const { dashboard } = buildNpsView(entries);
    expect(dashboard.vsLastMonth).toBeNull(); // no Feb entry to compare against
  });

  it("vsLastMonth and vsLastYear compute both when the matching months exist", () => {
    const entries = [
      entry({ month: "2025-06-01", current_value: 50000 }),
      entry({ month: "2026-05-01", current_value: 90000 }),
      entry({ month: "2026-06-01", current_value: 100000 }),
    ];
    const { dashboard } = buildNpsView(entries);
    expect(dashboard.vsLastMonth!.valueChangeAbs).toBe(10000);
    expect(dashboard.vsLastMonth!.valueChangePct).toBeCloseTo((10000 / 90000) * 100, 5);
    expect(dashboard.vsLastYear!.valueChangeAbs).toBe(50000);
    expect(dashboard.vsLastYear!.valueChangePct).toBeCloseTo(100, 5); // doubled
  });

  it("computes XIRR exactly 10% for a single month's contribution grown 1.1x over exactly a year", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }),
    ];
    const { rows, dashboard } = buildNpsView(entries);
    // Row 0's own XIRR (invested and valued same day) is undefined - no time has passed yet.
    expect(rows[0].xirrPct).toBeNull();
    expect(rows[1].xirrPct).toBeCloseTo(10, 3);
    expect(dashboard.xirrPct).toBeCloseTo(10, 3); // "final" XIRR = the latest row's
    expect(dashboard.safeSwpMonthly).toBeCloseTo((11000 * 0.04) / 12, 5); // same 4% rule, against the latest current_value
  });

  it("dashboard.safeSwpMonthly is null only when there are no entries yet", () => {
    expect(buildNpsView([]).dashboard.safeSwpMonthly).toBeNull();
  });

  it("XIRR is point-in-time: an early month's rate isn't affected by what happens later", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }), // +10% as of here
      entry({ month: "2027-01-01", amount_added: 0, current_value: 5000 }), // crashes later
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[1].xirrPct).toBeCloseTo(10, 3); // unaffected by the later crash
    expect(rows[2].xirrPct).toBeLessThan(0);
  });

  it("groups entries by year, most recent year first, and sums that year's contributions", () => {
    const entries = [
      entry({ month: "2019-01-01", amount_added: 5000, current_value: 5000 }),
      entry({ month: "2019-06-01", amount_added: 5000, current_value: 10500 }),
      entry({ month: "2020-01-01", amount_added: 7000, current_value: 18000 }),
    ];
    const { byYear } = buildNpsView(entries);
    expect(byYear.map((y) => y.year)).toEqual(["2020", "2019"]);
    const y2019 = byYear.find((y) => y.year === "2019")!;
    expect(y2019.yearInvested).toBe(10000);
    expect(y2019.yearEndValue).toBe(10500);
    expect(y2019.rows).toHaveLength(2);
  });

  it("yearEndXirrPct is the since-inception XIRR as of that year's last entry", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }), // +10% as of here
    ];
    const { byYear } = buildNpsView(entries);
    const y2026 = byYear.find((y) => y.year === "2026")!;
    expect(y2026.yearEndXirrPct).toBeCloseTo(10, 3);
    expect(y2026.yearEndXirrPct).toBe(y2026.rows[y2026.rows.length - 1].xirrPct);
  });

  it("nets withdrawals out of a year's invested total", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 2000, withdrawal: 3000, current_value: 9000 }),
    ];
    const { byYear } = buildNpsView(entries);
    expect(byYear[0].yearInvested).toBe(9000); // (10000 + 2000) - 3000
  });

  it("a negative amount_added (a correction/reversal) reduces both cumulative totals, not just one", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: -2000, current_value: 7500 }),
    ];
    const { rows } = buildNpsView(entries);
    expect(rows[1].cumulativeAdded).toBe(8000); // 10000 - 2000
    expect(rows[1].cumulativeInvested).toBe(8000); // 10000 + (-2000) - 0
  });
});
