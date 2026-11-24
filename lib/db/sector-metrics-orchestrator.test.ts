import { beforeEach, describe, expect, it } from "vitest";
import { computeAndStoreSectorMetrics } from "./sector-metrics-orchestrator";
import { __resetStoreForTests } from "./local-store";
import { listSectorMetricsForWeek, upsertSectorSnapshot } from "./sectors";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("computeAndStoreSectorMetrics", () => {
  it("persists one sector_metrics row per sector with rank and focus computed from stored snapshots", async () => {
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
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "IT",
      stage: 1,
      mrs: 1.2,
      rs_up: false,
      vs_ma: -2.8,
      chg4: -0.6,
      focus: false,
      source: "alert",
    });

    await computeAndStoreSectorMetrics("IN", "2026-11-20");

    const rows = await listSectorMetricsForWeek("IN", "2026-11-20");
    expect(rows).toHaveLength(2);
    const psuBank = rows.find((r) => r.sector === "PSU Bank")!;
    const it = rows.find((r) => r.sector === "IT")!;
    expect(psuBank.rank).toBe(1);
    expect(it.rank).toBe(2);
    expect(psuBank.mrs).toBe(12.4);
  });

  it("re-running for the same week updates in place rather than duplicating", async () => {
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "Bank",
      stage: 2,
      mrs: 8,
      rs_up: true,
      vs_ma: 5,
      chg4: 2,
      focus: true,
      source: "alert",
    });
    await computeAndStoreSectorMetrics("IN", "2026-11-20");
    await computeAndStoreSectorMetrics("IN", "2026-11-20");
    const rows = await listSectorMetricsForWeek("IN", "2026-11-20");
    expect(rows).toHaveLength(1);
  });
});
