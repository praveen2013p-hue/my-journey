import { describe, expect, it } from "vitest";
import {
  amortizedPayment,
  buildMutualFundView,
  monthLabel,
  monthsUntilTargetAge,
  realRatePct,
  shiftMonth,
} from "./mutual-fund-stats";
import type { MutualFundEntryRow } from "./db/schema-types";

function entry(overrides: Partial<MutualFundEntryRow> = {}): MutualFundEntryRow {
  return {
    id: crypto.randomUUID(),
    user_id: "u",
    month: "2026-01-01",
    amount_added: 0,
    withdrawal: 0,
    planned_amount: null,
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

  it("safeSwpMonthly is null without a birth year set - never guessed", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }),
    ];
    const { rows } = buildMutualFundView(entries); // no birthYear passed
    expect(rows[1].safeSwpMonthly).toBeNull();
  });

  it("safeSwpMonthly is null for the first entry - no XIRR yet to assume a return from", () => {
    const entries = [entry({ month: "2026-01-01", amount_added: 100000, current_value: 100000 })];
    const { rows } = buildMutualFundView(entries, 1990);
    expect(rows[0].xirrPct).toBeNull();
    expect(rows[0].safeSwpMonthly).toBeNull();
  });

  it("safeSwpMonthly is null once the target age is already reached", () => {
    const entries = [
      entry({ month: "2025-01-01", amount_added: 10000, current_value: 10000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 11000 }),
    ];
    const { rows } = buildMutualFundView(entries, 1930); // already 96 in 2026
    expect(rows[1].safeSwpMonthly).toBeNull();
  });

  it("safeSwpMonthly matches the straight-line amount when that month's REAL rate is 0% - nominal XIRR equal to assumed inflation (6%)", () => {
    const entries = [
      // 2021-01-01 to 2022-01-01 is exactly 365 days (2021 isn't a leap year) so the
      // Actual/365 XIRR solves to a flat 6%, not a day-count-skewed value.
      entry({ month: "2021-01-01", amount_added: 120000, current_value: 120000 }),
      entry({ month: "2022-01-01", amount_added: 0, current_value: 120000 * 1.06 }), // +6% nominal -> 0% real
    ];
    const birthYear = 2022 - 80; // 10 years left to 90, as of 2022-01-01
    const { rows } = buildMutualFundView(entries, birthYear);
    expect(rows[1].xirrPct).toBeCloseTo(6, 3);
    expect(rows[1].safeSwpMonthly).toBeCloseTo((120000 * 1.06) / 120, 2); // straight-line over 120 months
  });

  it("safeSwpMonthly is noticeably smaller than a naive nominal-rate calculation once inflation is assumed away", () => {
    // Same scenario as the live 10%-nominal-XIRR case, but computed here to confirm the
    // inflation haircut actually reduces the withdrawal, not just that it's non-null.
    const entries = [
      entry({ month: "2025-01-01", amount_added: 1100000, current_value: 1100000 }),
      entry({ month: "2026-01-01", amount_added: 0, current_value: 1210000 }), // +10% nominal
    ];
    const { rows } = buildMutualFundView(entries, 1992); // age 34 as of 2026-01-01
    expect(rows[1].xirrPct).toBeCloseTo(10, 3);
    // A naive (non-inflation-adjusted) calc at 10%/56yrs would be noticeably higher than this.
    const naiveMonthlyRate = Math.pow(1.1, 1 / 12) - 1;
    const naive = (1210000 * naiveMonthlyRate) / (1 - Math.pow(1 + naiveMonthlyRate, -672));
    expect(rows[1].safeSwpMonthly!).toBeLessThan(naive);
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
});

describe("amortizedPayment", () => {
  it("matches a well-known amortization table value: 100000 principal, 1%/month, 12 payments", () => {
    // Standard loan-table PMT factor for n=12, i=1% is 0.0888488.
    expect(amortizedPayment(100000, 0.01, 12)).toBeCloseTo(8884.88, 1);
  });

  it("is straight-line division when the rate is ~0", () => {
    expect(amortizedPayment(120000, 0, 120)).toBeCloseTo(1000, 5);
  });
});

describe("realRatePct", () => {
  it("is 0% when the nominal rate equals assumed inflation (6%)", () => {
    expect(realRatePct(6)).toBeCloseTo(0, 6);
  });

  it("matches the Fisher equation for a well-known pair (10% nominal, 6% inflation)", () => {
    // (1.10 / 1.06) - 1 = 0.0377358... computed independently of the code under test.
    expect(realRatePct(10)).toBeCloseTo(3.77358, 4);
  });

  it("is negative when the nominal rate is below assumed inflation", () => {
    expect(realRatePct(2)).toBeLessThan(0);
  });
});

describe("monthsUntilTargetAge", () => {
  it("computes years remaining to 90 from the month's year minus birth year", () => {
    expect(monthsUntilTargetAge("2026-01-01", 1992)).toBe((90 - 34) * 12);
  });

  it("is null once the target age is already reached", () => {
    expect(monthsUntilTargetAge("2026-01-01", 1930)).toBeNull(); // age 96
  });

  it("is null exactly at the target age (nothing left to amortize over)", () => {
    expect(monthsUntilTargetAge("2026-01-01", 2026 - 90)).toBeNull();
  });
});
