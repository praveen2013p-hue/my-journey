import { beforeEach, describe, expect, it } from "vitest";
import { getWeeklyReviewData } from "./weekly-review-data";
import { upsertSectorMetric } from "./db/sectors";
import { __resetStoreForTests } from "./db/local-store";
import type { SectorMetricRow } from "./db/schema-types";

const USER_ID = "praveen2013p@gmail.com";

function metric(overrides: Partial<Omit<SectorMetricRow, "id" | "created_at">>): Omit<SectorMetricRow, "id" | "created_at"> {
  return {
    market: "IN",
    week_ending: "2026-11-21",
    sector: "IT",
    rank: 1,
    mrs: 10,
    d4: 1,
    d13: 1,
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
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getWeeklyReviewData - focus sector changes", () => {
  it("doesn't mislabel a continuing focus sector as 'new' when the exact prior week's computation was missed - falls back to an earlier week", async () => {
    // Current week: IT is a focus sector.
    await upsertSectorMetric(metric({ week_ending: "2026-11-21", sector: "IT", is_focus: true }));
    // Exact prior week (2026-11-14) is deliberately MISSING - simulates a
    // one-off outage in that week's sector_metrics computation.
    // An earlier week (2026-11-07) shows IT was already a focus sector.
    await upsertSectorMetric(metric({ week_ending: "2026-11-07", sector: "IT", is_focus: true }));

    const data = await getWeeklyReviewData(USER_ID, "2026-11-21");
    const itChange = data.focusSectorChanges.find((c) => c.market === "IN" && c.sector === "IT");
    expect(itChange?.status).toBe("continuing");
  });

  it("still correctly labels a sector 'new' when there's genuinely no earlier focus data at all", async () => {
    await upsertSectorMetric(metric({ week_ending: "2026-11-21", sector: "IT", is_focus: true }));

    const data = await getWeeklyReviewData(USER_ID, "2026-11-21");
    const itChange = data.focusSectorChanges.find((c) => c.market === "IN" && c.sector === "IT");
    expect(itChange?.status).toBe("new");
  });

  it("still labels a sector 'dropped' when it was focus 2 weeks ago (exact prior week missing) but isn't focus now", async () => {
    await upsertSectorMetric(metric({ week_ending: "2026-11-21", sector: "IT", is_focus: false, mrs: -5 }));
    await upsertSectorMetric(metric({ week_ending: "2026-11-07", sector: "IT", is_focus: true }));

    const data = await getWeeklyReviewData(USER_ID, "2026-11-21");
    const itChange = data.focusSectorChanges.find((c) => c.market === "IN" && c.sector === "IT");
    expect(itChange?.status).toBe("dropped");
  });
});
