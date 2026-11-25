import { beforeEach, describe, expect, it } from "vitest";
import { getBreakoutsPageData } from "./breakouts-data";
import { upsertAlert } from "./db/alerts";
import { __resetStoreForTests } from "./db/local-store";

const USER = "praveen@example.com";

function alertInput(overrides: Partial<Parameters<typeof upsertAlert>[0]> = {}) {
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
    raw: {},
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getBreakoutsPageData RS Rating", () => {
  it("ranks each ticker's RS as a percentile among every ticker alerted in its market", async () => {
    await upsertAlert(alertInput({ ticker: "WEAK", mrs: -10, week_ending: "2026-11-20" }));
    await upsertAlert(alertInput({ ticker: "MID", mrs: 0, week_ending: "2026-11-20" }));
    await upsertAlert(alertInput({ ticker: "STRONG", mrs: 20, week_ending: "2026-11-20" }));

    const data = await getBreakoutsPageData(USER, "breakout", {});
    const byTicker = new Map(data.rows.map((r) => [r.ticker, r.rsRating]));
    expect(byTicker.get("STRONG")).toBe(99);
    expect(byTicker.get("WEAK")).toBe(33);
    expect(byTicker.get("MID")).toBe(67);
  });

  it("is null for a ticker whose mrs is null, never a guessed rating", async () => {
    await upsertAlert(alertInput({ ticker: "NODATA", mrs: null, week_ending: "2026-11-20" }));
    const data = await getBreakoutsPageData(USER, "breakout", {});
    expect(data.rows.find((r) => r.ticker === "NODATA")!.rsRating).toBeNull();
  });
});

describe("getBreakoutsPageData", () => {
  it("defaults to the latest week that has alerts", async () => {
    await upsertAlert(alertInput({ week_ending: "2026-11-13" }));
    await upsertAlert(alertInput({ ticker: "TCS", week_ending: "2026-11-20" }));

    const data = await getBreakoutsPageData(USER, "breakout", {});
    expect(data.weekEnding).toBe("2026-11-20");
    expect(data.rows.map((r) => r.ticker)).toEqual(["TCS"]);
  });

  it("nothing is 'new' on a user's first-ever visit (no baseline cutoff yet)", async () => {
    await upsertAlert(alertInput({ ticker: "SBIN" }));
    const first = await getBreakoutsPageData(USER, "breakout", {});
    expect(first.rows[0].isNew).toBe(false);
    expect(first.newSinceLastVisit).toBe(0);
  });

  it("an alert stored after a visit shows as new on the next visit, then stops after that visit", async () => {
    await getBreakoutsPageData(USER, "breakout", {}); // establishes a real cutoff
    await upsertAlert(alertInput({ ticker: "SBIN" }));

    const second = await getBreakoutsPageData(USER, "breakout", {});
    expect(second.rows[0].isNew).toBe(true);
    expect(second.newSinceLastVisit).toBe(1);

    const third = await getBreakoutsPageData(USER, "breakout", {});
    expect(third.rows[0].isNew).toBe(false);
  });

  it("computes weeks-since-breakout and original grade for a pullback", async () => {
    await upsertAlert(alertInput({ signal_type: "breakout", grade: "A", week_ending: "2026-11-06" }));
    await upsertAlert(
      alertInput({
        signal_type: "pullback",
        grade: "B",
        week_ending: "2026-11-20",
        breakout_level: 801.4,
      }),
    );

    const data = await getBreakoutsPageData(USER, "pullback", {});
    const row = data.rows.find((r) => r.ticker === "SBIN");
    expect(row?.originalGrade).toBe("A");
    expect(row?.originalBreakoutDate).toBe("2026-11-06");
    expect(row?.weeksSinceBreakout).toBe(2);
  });

  it("tab counts split by market for both signal types in the resolved window", async () => {
    await upsertAlert(alertInput({ ticker: "SBIN", market: "IN", signal_type: "breakout" }));
    await upsertAlert(alertInput({ ticker: "AAPL", market: "US", exchange: "NASDAQ", signal_type: "breakout" }));
    await upsertAlert(alertInput({ ticker: "AXISBANK", market: "IN", signal_type: "pullback" }));

    const data = await getBreakoutsPageData(USER, "breakout", {});
    expect(data.tabCounts.breakout).toEqual({ IN: 1, US: 1 });
    expect(data.tabCounts.pullback).toEqual({ IN: 1, US: 0 });
  });

  it("filters by market, grade and sector", async () => {
    await upsertAlert(alertInput({ ticker: "SBIN", market: "IN", grade: "A", sector: "Finance" }));
    await upsertAlert(alertInput({ ticker: "AAPL", market: "US", exchange: "NASDAQ", grade: "B", sector: "Technology" }));

    const data = await getBreakoutsPageData(USER, "breakout", { market: "IN", grades: "A" });
    expect(data.rows.map((r) => r.ticker)).toEqual(["SBIN"]);
  });
});
