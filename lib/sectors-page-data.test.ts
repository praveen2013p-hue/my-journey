import { beforeEach, describe, expect, it } from "vitest";
import { upsertAlert } from "./db/alerts";
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
  });
});
