import { beforeEach, describe, expect, it } from "vitest";
import { upsertAlert } from "./db/alerts";
import { replaceConstituents } from "./db/sector-constituents";
import { seedSectorMapIfEmpty } from "./db/sector-map";
import { upsertSectorSnapshot } from "./db/sectors";
import { __resetStoreForTests } from "./db/local-store";
import { getSectorsPageData } from "./sectors-page-data";
import { SECTOR_MAP_SEED } from "./sector-map-seed";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getSectorsPageData", () => {
  it("returns an empty result with no weekEnding when no snapshots exist yet", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    const data = await getSectorsPageData("IN");
    expect(data.weekEnding).toBeNull();
    expect(data.rows).toEqual([]);
  });

  it("combines sector_map, sector_metrics (rank/focus) and trigger counts from this week's alerts", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      stage: 2,
      mrs: 12.4,
      rs_up: true,
      vs_ma: 15.2,
      chg4: 6.1,
      focus: true,
      source: "alert",
    });
    await upsertAlert({
      market: "IN",
      exchange: "NSE",
      ticker: "SBIN",
      signal_type: "breakout",
      grade: "A",
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
      sector: "PSU Bank",
      industry: "Regional Banks",
      fundamentals: null,
      raw: {},
    });

    const data = await getSectorsPageData("IN");
    expect(data.weekEnding).toBe("2026-11-20");
    const psuBank = data.rows.find((r) => r.sector === "PSU Bank")!;
    expect(psuBank.mrs).toBe(12.4);
    expect(psuBank.vsMa).toBe(15.2);
    expect(psuBank.triggerCount).toBe(1);
    expect(psuBank.rank).toBe(1);

    // Every other seeded sector shows up too, with nulls rather than being dropped.
    const it = data.rows.find((r) => r.sector === "IT")!;
    expect(it.mrs).toBeNull();
    expect(it.triggerCount).toBe(0);
    expect(it.totalStocks).toBeNull();
    expect(it.rsAbove0).toBeNull();
  });

  it("counts total constituents and how many have mrs > 0 from their latest alert, in one pass per sector", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await replaceConstituents("IN", "PSU Bank", ["SBIN", "BANKBARODA", "PNB"]);
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      stage: 2,
      mrs: 12.4,
      rs_up: true,
      vs_ma: 15.2,
      chg4: 6.1,
      focus: true,
      source: "alert",
    });

    const upsert = (ticker: string, mrs: number | null, triggeredAt: string) =>
      upsertAlert({
        market: "IN",
        exchange: "NSE",
        ticker,
        signal_type: "breakout",
        grade: "A",
        week_ending: "2026-11-20",
        triggered_at: triggeredAt,
        trigger_price: 100,
        open: null,
        high: null,
        low: null,
        volume: null,
        breakout_level: null,
        vol_ratio: null,
        mrs,
        pct_above_ma: null,
        overhead_pct: null,
        sector: "PSU Bank",
        industry: null,
        fundamentals: null,
        raw: {},
      });

    await upsert("SBIN", 8.2, "2026-11-20T10:00:00+05:30"); // RS > 0
    await upsert("BANKBARODA", -1.5, "2026-11-20T10:00:00+05:30"); // RS <= 0
    // PNB never alerted, so it counts toward the total but not toward RS > 0.

    const data = await getSectorsPageData("IN");
    const psuBank = data.rows.find((r) => r.sector === "PSU Bank")!;
    expect(psuBank.totalStocks).toBe(3);
    expect(psuBank.rsAbove0).toBe(1);
  });

  it("only the ticker's most recent alert counts toward RS > 0, not an older one with the opposite sign", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      stage: 2,
      mrs: 12.4,
      rs_up: true,
      vs_ma: 15.2,
      chg4: 6.1,
      focus: true,
      source: "alert",
    });

    const upsert = (weekEnding: string, mrs: number, triggeredAt: string) =>
      upsertAlert({
        market: "IN",
        exchange: "NSE",
        ticker: "SBIN",
        signal_type: "breakout",
        grade: "A",
        week_ending: weekEnding,
        triggered_at: triggeredAt,
        trigger_price: 100,
        open: null,
        high: null,
        low: null,
        volume: null,
        breakout_level: null,
        vol_ratio: null,
        mrs,
        pct_above_ma: null,
        overhead_pct: null,
        sector: "PSU Bank",
        industry: null,
        fundamentals: null,
        raw: {},
      });

    await upsert("2026-11-13", -4, "2026-11-13T10:00:00+05:30");
    await upsert("2026-11-20", 6, "2026-11-20T10:00:00+05:30");

    const data = await getSectorsPageData("IN");
    const psuBank = data.rows.find((r) => r.sector === "PSU Bank")!;
    expect(psuBank.totalStocks).toBe(1);
    expect(psuBank.rsAbove0).toBe(1);
  });
});
