import { beforeEach, describe, expect, it } from "vitest";
import { getDashboardData } from "./dashboard-data";
import { upsertAlert } from "./db/alerts";
import { __resetStoreForTests } from "./db/local-store";
import { seedSectorMapIfEmpty } from "./db/sector-map";
import { upsertSectorSnapshot } from "./db/sectors";
import { SECTOR_MAP_SEED } from "./sector-map-seed";

function alertInput(overrides: Partial<Parameters<typeof upsertAlert>[0]> = {}) {
  return {
    market: "IN" as const,
    exchange: "NSE",
    ticker: "SBIN",
    signal_type: "breakout" as const,
    grade: "A" as const,
    week_ending: "2026-11-20",
    triggered_at: "2026-11-20T15:45:00+05:30",
    trigger_price: 800,
    open: null,
    high: null,
    low: null,
    volume: null,
    breakout_level: null,
    vol_ratio: null,
    mrs: null,
    pct_above_ma: null,
    overhead_pct: null,
    sector: null,
    industry: null,
    fundamentals: null,
    raw: {},
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getDashboardData", () => {
  it("defaults to the latest week with any alert and returns an empty state before that", async () => {
    const empty = await getDashboardData();
    expect(empty.weekEnding).toBeNull();

    await upsertAlert(alertInput({ week_ending: "2026-11-20" }));
    const data = await getDashboardData();
    expect(data.weekEnding).toBe("2026-11-20");
  });

  it("counts breakout triggers by market and grade, and pullbacks by market", async () => {
    await upsertAlert(alertInput({ ticker: "SBIN", market: "IN", grade: "A", signal_type: "breakout" }));
    await upsertAlert(alertInput({ ticker: "TCS", market: "IN", grade: "A", signal_type: "breakout" }));
    await upsertAlert(alertInput({ ticker: "AAPL", market: "US", exchange: "NASDAQ", grade: "B", signal_type: "breakout" }));
    await upsertAlert(alertInput({ ticker: "AXISBANK", market: "IN", grade: "A", signal_type: "pullback" }));

    const data = await getDashboardData("2026-11-20");
    expect(data.triggers.breakout.IN.A).toBe(2);
    expect(data.triggers.breakout.US.B).toBe(1);
    expect(data.triggers.pullback.IN).toBe(1);
    expect(data.triggers.pullback.US).toBe(0);
  });

  it("lists focus-starred sectors from both markets, sorted by RS descending", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await upsertAlert(alertInput({ week_ending: "2026-11-20" }));

    // Needs real Δ4/Δ13 history to be focus-eligible - back-fill 14 weeks of
    // steadily rising RS so both deltas come out positive.
    const latest = new Date(Date.UTC(2026, 10, 20));
    for (let weeksAgo = 14; weeksAgo >= 0; weeksAgo--) {
      const date = new Date(latest);
      date.setUTCDate(date.getUTCDate() - weeksAgo * 7);
      await upsertSectorSnapshot({
        market: "IN",
        week_ending: date.toISOString().slice(0, 10),
        sector: "PSU Bank",
        stage: 2,
        mrs: 5 + (14 - weeksAgo) * 0.5,
        rs_up: true,
        vs_ma: 10,
        chg4: 2,
        focus: true,
        source: "backfill",
      });
    }

    const data = await getDashboardData("2026-11-20");
    expect(data.topSectors.some((s) => s.sector === "PSU Bank" && s.market === "IN")).toBe(true);
  });
});
