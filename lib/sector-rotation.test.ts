import { beforeEach, describe, expect, it } from "vitest";
import { getSectorRotationMatrix } from "./sector-rotation";
import { __resetStoreForTests } from "./db/local-store";
import { seedSectorMapIfEmpty } from "./db/sector-map";
import { upsertSectorSnapshot } from "./db/sectors";
import { SECTOR_MAP_SEED } from "./sector-map-seed";

function snapshot(overrides: Partial<Parameters<typeof upsertSectorSnapshot>[0]> = {}) {
  return {
    market: "IN" as const,
    week_ending: "2026-11-20",
    sector: "PSU Bank",
    stage: 2 as const,
    mrs: 0,
    rs_up: true,
    vs_ma: 0,
    chg4: 0,
    focus: false,
    source: "alert" as const,
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getSectorRotationMatrix", () => {
  it("ranks sectors within each week by mrs, strongest first", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await upsertSectorSnapshot(snapshot({ sector: "PSU Bank", mrs: 10, week_ending: "2026-11-20" }));
    await upsertSectorSnapshot(snapshot({ sector: "IT", mrs: 20, week_ending: "2026-11-20" }));
    await upsertSectorSnapshot(snapshot({ sector: "Pharma", mrs: -5, week_ending: "2026-11-20" }));

    const matrix = await getSectorRotationMatrix("IN");
    expect(matrix.weeks).toEqual(["2026-11-20"]);
    expect(matrix.ranks["IT"]["2026-11-20"]).toBe(1);
    expect(matrix.ranks["PSU Bank"]["2026-11-20"]).toBe(2);
    expect(matrix.ranks["Pharma"]["2026-11-20"]).toBe(3);
  });

  it("leaves a sector null for a week it has no snapshot for, rather than guessing a rank", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await upsertSectorSnapshot(snapshot({ sector: "PSU Bank", mrs: 10, week_ending: "2026-11-20" }));

    const matrix = await getSectorRotationMatrix("IN");
    expect(matrix.ranks["IT"]["2026-11-20"]).toBeNull();
  });

  it("orders sectors by their most recent rank, strongest first", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await upsertSectorSnapshot(snapshot({ sector: "PSU Bank", mrs: -5, week_ending: "2026-11-20" }));
    await upsertSectorSnapshot(snapshot({ sector: "IT", mrs: 20, week_ending: "2026-11-20" }));

    const matrix = await getSectorRotationMatrix("IN");
    expect(matrix.sectors[0]).toBe("IT");
  });

  it("returns empty when no sector map has been seeded", async () => {
    const matrix = await getSectorRotationMatrix("IN");
    expect(matrix).toEqual({ weeks: [], sectors: [], ranks: {} });
  });
});
