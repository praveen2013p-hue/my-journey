import { beforeEach, describe, expect, it } from "vitest";
import { getLatestWeekEnding, listAlerts, upsertAlert } from "./alerts";
import { __resetStoreForTests } from "./local-store";

function sampleInput(overrides: Partial<Parameters<typeof upsertAlert>[0]> = {}) {
  return {
    market: "IN" as const,
    exchange: "NSE",
    ticker: "SBIN",
    signal_type: "breakout" as const,
    grade: "A" as const,
    week_ending: "2026-11-20",
    triggered_at: "2026-11-20T15:45:00+05:30",
    trigger_price: 812.5,
    open: 790.1,
    high: 818.9,
    low: 788.0,
    volume: 54231000,
    breakout_level: 801.4,
    vol_ratio: 2.31,
    mrs: 4.7,
    pct_above_ma: 9.8,
    overhead_pct: 0,
    sector: "Finance",
    industry: "Regional Banks",
    fundamentals: null,
    raw: { secret: "redacted" },
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("upsertAlert", () => {
  it("inserts a new row the first time a key is seen", async () => {
    const { row, wasUpdate } = await upsertAlert(sampleInput());
    expect(wasUpdate).toBe(false);
    expect(row.ticker).toBe("SBIN");
    expect(row.quality_score).toBeGreaterThan(0);
  });

  it("the same (market, ticker, signal_type, week_ending) updates in place instead of duplicating", async () => {
    const first = await upsertAlert(sampleInput({ trigger_price: 812.5 }));
    const second = await upsertAlert(sampleInput({ trigger_price: 820.0 }));

    expect(second.wasUpdate).toBe(true);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.trigger_price).toBe(820.0);

    const all = await listAlerts();
    expect(all.filter((a) => a.ticker === "SBIN")).toHaveLength(1);
  });

  it("a different week_ending for the same ticker creates a second row", async () => {
    await upsertAlert(sampleInput({ week_ending: "2026-11-20" }));
    await upsertAlert(sampleInput({ week_ending: "2026-11-27" }));
    const all = await listAlerts();
    expect(all).toHaveLength(2);
  });

  it("a different signal_type for the same ticker/week creates a second row (breakout vs pullback)", async () => {
    await upsertAlert(sampleInput({ signal_type: "breakout" }));
    await upsertAlert(sampleInput({ signal_type: "pullback" }));
    const all = await listAlerts();
    expect(all).toHaveLength(2);
  });
});

describe("listAlerts filters", () => {
  beforeEach(async () => {
    await upsertAlert(sampleInput({ ticker: "SBIN", market: "IN", grade: "A", week_ending: "2026-11-20" }));
    await upsertAlert(sampleInput({ ticker: "AXISBANK", market: "IN", grade: "B", week_ending: "2026-11-20" }));
    await upsertAlert(sampleInput({ ticker: "AAPL", market: "US", grade: "A", week_ending: "2026-11-20", exchange: "NASDAQ" }));
  });

  it("filters by market", async () => {
    const rows = await listAlerts({ market: "US" });
    expect(rows.map((r) => r.ticker)).toEqual(["AAPL"]);
  });

  it("filters by grade", async () => {
    const rows = await listAlerts({ grades: ["A"] });
    expect(rows.map((r) => r.ticker).sort()).toEqual(["AAPL", "SBIN"]);
  });

  it("filters by ticker search, case-insensitive", async () => {
    const rows = await listAlerts({ search: "sbin" });
    expect(rows.map((r) => r.ticker)).toEqual(["SBIN"]);
  });

  it("getLatestWeekEnding finds the most recent week with alerts", async () => {
    await upsertAlert(sampleInput({ ticker: "TANLA", week_ending: "2026-11-27" }));
    expect(await getLatestWeekEnding()).toBe("2026-11-27");
  });
});
