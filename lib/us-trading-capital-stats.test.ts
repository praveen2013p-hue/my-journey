import { describe, expect, it } from "vitest";
import type { UsTradingCapitalEntryRow } from "./db/schema-types";
import { buildUsTradingCapitalView, convertInrToUsd } from "./us-trading-capital-stats";

function entry(overrides: Partial<UsTradingCapitalEntryRow>): UsTradingCapitalEntryRow {
  return {
    id: overrides.month ?? "x",
    user_id: "u",
    month: "2023-01-01",
    amount_added: 0,
    withdrawal: 0,
    inr_amount: null,
    fx_rate: null,
    value_fx_rate: null,
    current_value: 0,
    notes: null,
    negative_amount_note: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("buildUsTradingCapitalView - USD annualized return", () => {
  it("matches a hand-verified XIRR: $1000 -> $1100 over exactly 365 days is 10%", () => {
    const entries = [
      entry({ month: "2023-01-01", amount_added: 1000, current_value: 1000 }),
      entry({ month: "2024-01-01", amount_added: 0, current_value: 1100 }),
    ];
    const view = buildUsTradingCapitalView(entries);
    expect(view.dashboard.xirrPct).not.toBeNull();
    expect(view.dashboard.xirrPct!).toBeCloseTo(10, 4);
  });

  it("is null for a single month (no time elapsed to solve a rate from)", () => {
    const entries = [entry({ month: "2023-01-01", amount_added: 1000, current_value: 1000 })];
    const view = buildUsTradingCapitalView(entries);
    expect(view.dashboard.xirrPct).toBeNull();
  });

  it("is null with no entries at all", () => {
    const view = buildUsTradingCapitalView([]);
    expect(view.dashboard.latestMonth).toBeNull();
    expect(view.dashboard.xirrPct).toBeNull();
    expect(view.dashboard.realReturnPct).toBeNull();
  });
});

describe("buildUsTradingCapitalView - Real Return (FX-adjusted, INR)", () => {
  it("matches a hand-verified, genuinely different figure from the USD return - proving per-month historical rates are used, not a single end rate rescaling the USD number", () => {
    // Deposit converts at ~80/$; 1 year later the balance is $1100 (10% USD
    // gain) but today's rate is 90/$ (the rupee weakened ~12.5% in between).
    // Real return = (1 + 0.10) * (1 + 0.125) - 1 = 0.2375 = 23.75% - a
    // compounding of both effects, meaningfully different from the 10% USD
    // figure, and NOT simply "10% * some single multiplier applied once."
    const entries = [
      entry({ month: "2023-01-01", amount_added: 1000, fx_rate: 80, value_fx_rate: 80, current_value: 1000 }),
      entry({ month: "2024-01-01", amount_added: 0, value_fx_rate: 90, current_value: 1100 }),
    ];
    const view = buildUsTradingCapitalView(entries);
    expect(view.dashboard.xirrPct!).toBeCloseTo(10, 4);
    expect(view.dashboard.realReturnPct).not.toBeNull();
    expect(view.dashboard.realReturnPct!).toBeCloseTo(23.75, 3);
    expect(view.dashboard.realReturnBlockedReason).toBeNull();
  });

  it("uses inr_amount directly when given, in preference to deriving it from amount_added * fx_rate", () => {
    // fx_rate alone would derive 1000 * 80 = 80,000; inr_amount overrides
    // that with the actually-recorded 82,000 (a deposit rarely converts at
    // a perfectly round rate).
    const entries = [
      entry({ month: "2023-01-01", amount_added: 1000, inr_amount: 82_000, fx_rate: 80, value_fx_rate: 82, current_value: 1000 }),
      entry({ month: "2024-01-01", amount_added: 0, value_fx_rate: 82, current_value: 1000 }),
    ];
    const view = buildUsTradingCapitalView(entries);
    // Flat $1000 -> $1000 and a flat 82,000 -> 82,000 INR: both returns are 0%.
    expect(view.dashboard.xirrPct!).toBeCloseTo(0, 6);
    expect(view.dashboard.realReturnPct!).toBeCloseTo(0, 6);
  });

  it("is null with reason 'missing_deposit_data' when a month has a nonzero deposit but neither inr_amount nor fx_rate - and stays null for every later month too", () => {
    const entries = [
      entry({ month: "2023-01-01", amount_added: 1000, fx_rate: 80, value_fx_rate: 80, current_value: 1000 }),
      // No inr_amount, no fx_rate, but a real deposit - unconvertible.
      entry({ month: "2023-06-01", amount_added: 500, value_fx_rate: 83, current_value: 1600 }),
      entry({ month: "2024-01-01", amount_added: 0, value_fx_rate: 90, current_value: 1800 }),
    ];
    const view = buildUsTradingCapitalView(entries);
    expect(view.rows[1].realReturnBlockedReason).toBe("missing_deposit_data");
    expect(view.rows[1].realReturnPct).toBeNull();
    // Stays broken - the third row's cumulative INR history is permanently
    // missing the second row's flow, so it can't be a valid figure either.
    expect(view.rows[2].realReturnBlockedReason).toBe("missing_deposit_data");
    expect(view.dashboard.realReturnPct).toBeNull();
    expect(view.dashboard.realReturnBlockedReason).toBe("missing_deposit_data");
    // The USD-only return is entirely unaffected by this.
    expect(view.dashboard.xirrPct).not.toBeNull();
  });

  it("is null with reason 'missing_current_rate' when every deposit converts fine but the latest entry has no value_fx_rate", () => {
    const entries = [
      entry({ month: "2023-01-01", amount_added: 1000, fx_rate: 80, value_fx_rate: 80, current_value: 1000 }),
      entry({ month: "2024-01-01", amount_added: 0, current_value: 1100 }), // no value_fx_rate
    ];
    const view = buildUsTradingCapitalView(entries);
    expect(view.dashboard.realReturnPct).toBeNull();
    expect(view.dashboard.realReturnBlockedReason).toBe("missing_current_rate");
    expect(view.dashboard.xirrPct).not.toBeNull();
  });

  it("needs no FX data at all for a zero-deposit, zero-withdrawal month", () => {
    const entries = [
      entry({ month: "2023-01-01", amount_added: 1000, fx_rate: 80, value_fx_rate: 80, current_value: 1000 }),
      // No inr_amount, no fx_rate - fine, since amount_added/withdrawal are
      // both 0 this month (just a value_fx_rate for this row's own figure).
      entry({ month: "2023-06-01", amount_added: 0, withdrawal: 0, value_fx_rate: 85, current_value: 1050 }),
      entry({ month: "2024-01-01", amount_added: 0, value_fx_rate: 90, current_value: 1100 }),
    ];
    const view = buildUsTradingCapitalView(entries);
    expect(view.rows[1].realReturnBlockedReason).toBeNull();
    expect(view.dashboard.realReturnPct).not.toBeNull();
    expect(view.dashboard.realReturnBlockedReason).toBeNull();
  });

  it("is null (no blocked reason) for a single month, same as the USD figure - not enough history, not missing data", () => {
    const entries = [entry({ month: "2023-01-01", amount_added: 1000, fx_rate: 80, value_fx_rate: 80, current_value: 1000 })];
    const view = buildUsTradingCapitalView(entries);
    expect(view.dashboard.realReturnPct).toBeNull();
    expect(view.dashboard.realReturnBlockedReason).toBeNull();
  });
});

describe("convertInrToUsd", () => {
  it("divides INR by the FX rate", () => {
    expect(convertInrToUsd(100_000, 100)).toBe(1000);
  });

  it("rounds to 2 decimal places", () => {
    expect(convertInrToUsd(1000, 3)).toBe(333.33);
  });

  it("is null for a non-finite input", () => {
    expect(convertInrToUsd(NaN, 83)).toBeNull();
    expect(convertInrToUsd(1000, NaN)).toBeNull();
  });

  it("is null for a zero or negative FX rate", () => {
    expect(convertInrToUsd(1000, 0)).toBeNull();
    expect(convertInrToUsd(1000, -5)).toBeNull();
  });
});
