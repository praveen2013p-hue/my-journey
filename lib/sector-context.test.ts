import { beforeEach, describe, expect, it } from "vitest";
import { replaceConstituents } from "./db/sector-constituents";
import { __resetStoreForTests } from "./db/local-store";
import { upsertSectorMetric, upsertSectorSnapshot } from "./db/sectors";
import { getSectorContextsForTicker } from "./sector-context";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getSectorContextsForTicker", () => {
  it("is empty when no sector_constituents upload covers this ticker", async () => {
    const contexts = await getSectorContextsForTicker("IN", "SBIN", "2026-11-20");
    expect(contexts).toEqual([]);
  });

  it("returns stage/mrs/focus for every sector the ticker belongs to", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);
    await replaceConstituents("IN", "Bank", ["SBIN"]);

    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      stage: 2,
      mrs: 12.4,
      rs_up: true,
      vs_ma: 15,
      chg4: 6,
      focus: true,
      source: "alert",
    });
    await upsertSectorMetric({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      rank: 1,
      mrs: 12.4,
      d4: 3,
      d13: 2,
      d26: null,
      d52: null,
      traded_value: null,
      tv_avg10: null,
      tv_ratio: null,
      is_focus: true,
      price_chg_1w: null,
      rs_chg_1w: null,
      traded_value_chg_1w: null,
      rank_move_1w: null,
    });

    const contexts = await getSectorContextsForTicker("IN", "SBIN", "2026-11-20");
    expect(contexts).toHaveLength(2);
    const psuBank = contexts.find((c) => c.sector === "PSU Bank")!;
    expect(psuBank.stage).toBe(2);
    expect(psuBank.mrs).toBe(12.4);
    expect(psuBank.isFocus).toBe(true);

    // Bank has no snapshot/metric for this week - known to belong, strength unknown.
    const bank = contexts.find((c) => c.sector === "Bank")!;
    expect(bank.stage).toBeNull();
    expect(bank.isFocus).toBe(false);
  });
});
