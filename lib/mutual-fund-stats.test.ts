import { describe, expect, it } from "vitest";
import { buildMutualFundView, computeBenchmarkSeries, computeGoalProjection, computeSafeSwpSustainYears } from "./mutual-fund-stats";
import type { MutualFundEntryRow } from "./db/schema-types";

function entry(overrides: Partial<MutualFundEntryRow> = {}): MutualFundEntryRow {
  return {
    id: crypto.randomUUID(),
    user_id: "u",
    profile_id: "p",
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

  it("gainPct is null (never an inverted-sign number) when cumulativeInvested is exactly 0 or negative", () => {
    const zeroBase = [entry({ month: "2026-01-01", amount_added: 10000, withdrawal: 10000, current_value: 500 })];
    expect(buildMutualFundView(zeroBase).rows[0].cumulativeInvested).toBe(0);
    expect(buildMutualFundView(zeroBase).rows[0].gainPct).toBeNull();

    // A withdrawal larger than net invested-to-date pushes cumulativeInvested
    // negative - a real gain (gainAbs > 0) here must not render as a large
    // negative percentage.
    const negativeBase = [
      entry({ month: "2026-01-01", amount_added: 100000, current_value: 100000 }),
      entry({ month: "2026-02-01", amount_added: 0, withdrawal: 150000, current_value: 10000 }),
    ];
    const row = buildMutualFundView(negativeBase).rows[1];
    expect(row.cumulativeInvested).toBe(-50000);
    expect(row.gainAbs).toBe(60000); // a real profit
    expect(row.gainPct).toBeNull();
  });

  it("safeSwpMonthly is the classic 4% rule - 4% of that month's own current_value per year, divided into a monthly amount", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 1200000, current_value: 1200000 })];
    const { rows } = buildMutualFundView(entries);
    expect(rows[0].safeSwpMonthly).toBeCloseTo((1200000 * 0.04) / 12, 5); // 4,000
  });

  it("safeSwpMonthly is recalculated fresh each month against that month's own current_value, not a fixed plan", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 1000000, current_value: 1000000 }),
      entry({ month: "2026-02-01", amount_added: 0, current_value: 1100000 }),
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[0].safeSwpMonthly).toBeCloseTo((1000000 * 0.04) / 12, 5);
    expect(rows[1].safeSwpMonthly).toBeCloseTo((1100000 * 0.04) / 12, 5); // moves with the new value, not the first month's
  });

  it("safeSwpMonthly doesn't depend on XIRR or birth year at all - it's always computable", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 50000, current_value: 50000 })];
    const { rows } = buildMutualFundView(entries);
    expect(rows[0].xirrPct).toBeNull(); // first entry, same-day guard - no XIRR yet
    expect(rows[0].safeSwpMonthly).toBeCloseTo((50000 * 0.04) / 12, 5); // still computed
  });

  it("pnlChangeAbs is the exact-month-over-month change in Gain, null for the first entry", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10200 }), // gain = 200
      entry({ month: "2026-02-01", amount_added: 5000, current_value: 15800 }), // gain = 800
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[0].pnlChangeAbs).toBeNull();
    expect(rows[1].pnlChangeAbs).toBe(600); // 800 - 200
  });

  it("pnlChangeAbs is null when the prior calendar month has no entry - never approximated from an older one", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10200 }),
      // February skipped.
      entry({ month: "2026-03-01", amount_added: 0, current_value: 10500 }),
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[1].pnlChangeAbs).toBeNull();
  });

  it("a withdrawal reduces cumulative invested, since it's money no longer in the fund", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 0, withdrawal: 3000, current_value: 7500 }),
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[1].cumulativeInvested).toBe(7000); // 10000 - 3000
    expect(rows[1].gainAbs).toBe(500); // 7500 - 7000
  });

  it("cumulativeAdded is gross - unlike cumulativeInvested, a withdrawal never reduces it", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 5000, withdrawal: 3000, current_value: 12000 }),
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[1].cumulativeAdded).toBe(15000); // 10000 + 5000, withdrawal ignored
    expect(rows[1].cumulativeInvested).toBe(12000); // 15000 - 3000
  });

  it("planned_amount never affects cumulative invested or gain", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 5000, planned_amount: 10000, current_value: 5200 })];
    const { rows } = buildMutualFundView(entries);
    expect(rows[0].cumulativeInvested).toBe(5000);
    expect(rows[0].gainAbs).toBe(200);
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

  it("computes XIRR exactly 10% for a single month's contribution grown 1.1x over exactly a year", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }),
    ];
    const { rows, dashboard } = buildMutualFundView(entries);
    // Row 0's own XIRR (invested and valued same day) is undefined - no time has passed yet.
    expect(rows[0].xirrPct).toBeNull();
    expect(rows[1].xirrPct).toBeCloseTo(10, 3);
    expect(dashboard.xirrPct).toBeCloseTo(10, 3); // "final" XIRR = the latest row's
    expect(dashboard.safeSwpMonthly).toBeCloseTo((11000 * 0.04) / 12, 5); // same 4% rule, against the latest current_value
  });

  it("dashboard.safeSwpMonthly is null only when there are no entries yet", () => {
    expect(buildMutualFundView([]).dashboard.safeSwpMonthly).toBeNull();
  });

  it("XIRR is point-in-time: an early month's rate isn't affected by what happens later", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }), // +10% as of here
      entry({ month: "2027-01-01", amount_added: 0, current_value: 5000 }), // crashes later
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[1].xirrPct).toBeCloseTo(10, 3); // unaffected by the later crash
    expect(rows[2].xirrPct).toBeLessThan(0);
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

  it("yearEndXirrPct is the since-inception XIRR as of that year's last entry", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }), // +10% as of here
    ];
    const { byYear } = buildMutualFundView(entries);
    const y2026 = byYear.find((y) => y.year === "2026")!;
    expect(y2026.yearEndXirrPct).toBeCloseTo(10, 3);
    expect(y2026.yearEndXirrPct).toBe(y2026.rows[y2026.rows.length - 1].xirrPct);
  });

  it("nets withdrawals out of a year's invested total", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: 2000, withdrawal: 3000, current_value: 9000 }),
    ];
    const { byYear } = buildMutualFundView(entries);
    expect(byYear[0].yearInvested).toBe(9000); // (10000 + 2000) - 3000
  });

  it("a negative amount_added (a correction/reversal) reduces both cumulative totals, not just one", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-02-01", amount_added: -2000, current_value: 7500 }),
    ];
    const { rows } = buildMutualFundView(entries);
    expect(rows[1].cumulativeAdded).toBe(8000); // 10000 - 2000
    expect(rows[1].cumulativeInvested).toBe(8000); // 10000 + (-2000) - 0
  });

});

describe("computeGoalProjection", () => {
  it("projects months-to-goal from the monthly rate implied by XIRR - hand-verifiable by construction", () => {
    // Build a monthly rate of exactly 1% (0.01), then an XIRR that
    // converts back to exactly that monthly rate, then a goal set to
    // exactly 70 months of 1%-monthly growth away - so the expected
    // answer is exactly 70 by construction of the closed-form formula.
    const monthlyRate = 0.01;
    const xirrPct = (Math.pow(1 + monthlyRate, 12) - 1) * 100;
    const currentValue = 100000;
    const goalAmount = currentValue * Math.pow(1 + monthlyRate, 70);

    const result = computeGoalProjection(currentValue, goalAmount, xirrPct);
    expect(result.status).toBe("projected");
    expect((result as { status: "projected"; months: number }).months).toBeCloseTo(70, 5);
  });

  it("is 'reached' when currentValue is already at or past the goal - never a negative/guessed month count", () => {
    expect(computeGoalProjection(500000, 500000, 12).status).toBe("reached");
    expect(computeGoalProjection(600000, 500000, 12).status).toBe("reached");
  });

  it("is 'no_xirr' when there's no since-inception XIRR yet to project from", () => {
    expect(computeGoalProjection(100000, 500000, null).status).toBe("no_xirr");
  });

  it("is 'no_growth' when the XIRR implies a zero or negative monthly rate - never 'Infinity' or a guessed number", () => {
    expect(computeGoalProjection(100000, 500000, 0).status).toBe("no_growth");
    expect(computeGoalProjection(100000, 500000, -5).status).toBe("no_growth");
  });

  it("is 'no_capital' when currentValue is 0 (e.g. a full withdrawal) with a goal still unmet - never Infinity months", () => {
    const result = computeGoalProjection(0, 500000, 20);
    expect(result.status).toBe("no_capital");
    expect(result).not.toHaveProperty("months");
  });

  it("is 'no_capital' for a negative currentValue too, same as zero", () => {
    expect(computeGoalProjection(-1000, 500000, 20).status).toBe("no_capital");
  });
});

describe("computeSafeSwpSustainYears", () => {
  it("projects a finite year count that actually depletes the corpus - verified by plugging the result back into the fixed-withdrawal depletion formula", () => {
    const currentValue = 100000;
    const xirrPct = 2; // 2% - below the 4% withdrawal rate, so this must be finite
    const result = computeSafeSwpSustainYears(currentValue, xirrPct);
    expect(result.status).toBe("projected");
    const { years } = result as { status: "projected"; years: number };

    const r = xirrPct / 100;
    const annualWithdrawal = 0.04 * currentValue;
    const corpusAtYears =
      currentValue * Math.pow(1 + r, years) - annualWithdrawal * ((Math.pow(1 + r, years) - 1) / r);
    expect(corpusAtYears).toBeCloseTo(0, 2);
  });

  it("is exactly 25 years at 0% growth, independent of the amount - 1/4%", () => {
    expect((computeSafeSwpSustainYears(100000, 0) as { years: number }).years).toBeCloseTo(25, 10);
    expect((computeSafeSwpSustainYears(9000000, 0) as { years: number }).years).toBeCloseTo(25, 10);
  });

  it("is shorter than 25 years once growth turns negative", () => {
    const result = computeSafeSwpSustainYears(100000, -3);
    expect(result.status).toBe("projected");
    expect((result as { years: number }).years).toBeLessThan(25);
  });

  it("is 'indefinite' when the current XIRR already meets or beats the 4% withdrawal rate", () => {
    expect(computeSafeSwpSustainYears(100000, 4).status).toBe("indefinite");
    expect(computeSafeSwpSustainYears(100000, 10).status).toBe("indefinite");
  });

  it("is 'no_capital' when currentValue is 0 or negative - nothing to sustain", () => {
    expect(computeSafeSwpSustainYears(0, 5).status).toBe("no_capital");
    expect(computeSafeSwpSustainYears(-1000, 5).status).toBe("no_capital");
  });

  it("is 'no_xirr' when there's no since-inception XIRR yet", () => {
    expect(computeSafeSwpSustainYears(100000, null).status).toBe("no_xirr");
  });

  it("is 'invalid_rate' for an XIRR of -100% or worse - never a guessed/NaN year count", () => {
    const result = computeSafeSwpSustainYears(100000, -100);
    expect(result.status).toBe("invalid_rate");
    expect(result).not.toHaveProperty("years");
  });
});

describe("computeBenchmarkSeries", () => {
  // Round, hand-verifiable index levels injected via `lookupLevel` - the real
  // table's irregular values would make the expected math hard to check by
  // hand, and that's not what this test is for (the table itself isn't
  // exercised here at all).
  const levels: Record<string, number> = {
    "2026-01-01": 100,
    "2026-02-01": 110,
    "2026-03-01": 121,
  };
  const lookup = (month: string) => levels[month] ?? null;

  it("simulates buying index units with the same net cash flow each month, valued at that month's level", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000 }),
      entry({ month: "2026-02-01", amount_added: 11000 }),
      entry({ month: "2026-03-01", amount_added: 0 }),
    ];
    const series = computeBenchmarkSeries(entries, lookup);

    // Jan: 10000 / 100 = 100 units, valued at 100 -> 10,000
    expect(series[0].value).toBeCloseTo(10000, 6);
    // Feb: +11000 / 110 = 100 more units (200 total), valued at 110 -> 22,000
    expect(series[1].value).toBeCloseTo(22000, 6);
    // Mar: no new flow, still 200 units, valued at 121 -> 24,200
    expect(series[2].value).toBeCloseTo(24200, 6);
  });

  it("treats a withdrawal as a negative flow, same sign convention as cumulativeInvested", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000 }),
      entry({ month: "2026-02-01", amount_added: 0, withdrawal: 5500 }),
    ];
    const series = computeBenchmarkSeries(entries, lookup);

    expect(series[0].value).toBeCloseTo(10000, 6);
    // Feb: netFlow = 0 - 5500 = -5500; -5500/110 = -50 units -> 100-50=50 units, valued at 110 -> 5,500
    expect(series[1].value).toBeCloseTo(5500, 6);
  });

  it("is null for a month with no index coverage, and null for every month after a missed contribution", () => {
    const entries = [
      entry({ month: "2025-12-01", amount_added: 5000 }), // not in `levels` - no coverage
      entry({ month: "2026-01-01", amount_added: 10000 }), // has coverage, but the running total is already broken
      entry({ month: "2026-02-01", amount_added: 0 }),
    ];
    const series = computeBenchmarkSeries(entries, lookup);

    expect(series[0].value).toBeNull();
    expect(series[1].value).toBeNull();
    expect(series[2].value).toBeNull();
  });

  it("a zero-flow month with no index coverage doesn't break coverage for months around it", () => {
    const entries = [
      entry({ month: "2026-01-01", amount_added: 10000 }),
      entry({ month: "2025-11-01", amount_added: 0 }), // no coverage, but nothing to invest that month either
      entry({ month: "2026-02-01", amount_added: 11000 }),
    ];
    const series = computeBenchmarkSeries(entries, lookup);
    const byMonth = new Map(series.map((p) => [p.month, p.value]));

    expect(byMonth.get("2025-11-01")).toBeNull();
    expect(byMonth.get("2026-01-01")).toBeCloseTo(10000, 6);
    expect(byMonth.get("2026-02-01")).toBeCloseTo(22000, 6);
  });
});
