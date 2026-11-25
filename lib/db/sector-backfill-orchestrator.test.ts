import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backfillSectorIndexHistory } from "./sector-backfill-orchestrator";
import { __resetStoreForTests } from "./local-store";
import { seedSectorMapIfEmpty } from "./sector-map";
import { listSectorSnapshotHistory, upsertSectorSnapshot } from "./sectors";
import { SECTOR_MAP_SEED } from "../sector-map-seed";
import { weekEndingForAlert } from "../time";

beforeEach(async () => {
  await __resetStoreForTests();
  await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
});

describe("backfillSectorIndexHistory (India, uses the mock provider - no KITE_API_KEY in tests)", () => {
  it("stores backfilled weeks for every India sector with a resolved symbol, and flags the rest as unresolved", async () => {
    const results = await backfillSectorIndexHistory("IN");

    const bank = results.find((r) => r.sector === "Bank")!;
    expect(bank.status).toBe("stored");
    expect(bank.weeksStored).toBeGreaterThan(0);

    // BRIEF.md §5c / sector-map-seed.ts: only Bank, PSU Bank, IT, Defence have a known symbol today.
    const unresolved = results.filter((r) => r.status === "no-provider-symbol");
    expect(unresolved.length).toBe(24);
    expect(unresolved.map((r) => r.sector)).not.toContain("Bank");
  });

  it("never overwrites a week that already has an alert-sourced snapshot (BRIEF.md §17.4)", async () => {
    const thisWeek = weekEndingForAlert(new Date(), "IN");
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: thisWeek,
      sector: "Bank",
      stage: 2,
      mrs: 99,
      rs_up: true,
      vs_ma: 12,
      chg4: 3,
      focus: true,
      source: "alert",
    });

    const results = await backfillSectorIndexHistory("IN");
    const bank = results.find((r) => r.sector === "Bank")!;
    expect(bank.weeksSkippedExistingAlert).toBe(1);

    const history = await listSectorSnapshotHistory("IN");
    const thisWeekRow = history.find((r) => r.sector === "Bank" && r.week_ending === thisWeek)!;
    expect(thisWeekRow.source).toBe("alert");
    expect(thisWeekRow.mrs).toBe(99);
  });

  it("stores no rows for a sector with no resolved provider_symbol", async () => {
    const results = await backfillSectorIndexHistory("IN");
    const it_ = results.find((r) => r.sector === "Auto")!; // Auto has no known symbol in the seed
    expect(it_.status).toBe("no-provider-symbol");
    expect(it_.weeksStored).toBe(0);

    const history = await listSectorSnapshotHistory("IN");
    expect(history.some((r) => r.sector === "Auto")).toBe(false);
  });
});

describe("backfillSectorIndexHistory (US, forced to the mock provider)", () => {
  beforeEach(() => {
    process.env.FORCE_MOCK_US = "true";
  });
  afterEach(() => {
    delete process.env.FORCE_MOCK_US;
  });

  it("backfills every US sector and industry (brief gives all their symbols)", async () => {
    const results = await backfillSectorIndexHistory("US");
    expect(results.every((r) => r.status === "stored")).toBe(true);
    expect(results.length).toBe(29); // 11 sectors + 18 industries
  });

  it("re-running is idempotent: the same sector ends up with the same number of stored weeks, not duplicates", async () => {
    await backfillSectorIndexHistory("US");
    const historyAfterFirstRun = await listSectorSnapshotHistory("US");
    const technologyCountAfterFirst = historyAfterFirstRun.filter((r) => r.sector === "Technology").length;

    await backfillSectorIndexHistory("US");
    const historyAfterSecondRun = await listSectorSnapshotHistory("US");
    const technologyCountAfterSecond = historyAfterSecondRun.filter((r) => r.sector === "Technology").length;

    expect(technologyCountAfterSecond).toBe(technologyCountAfterFirst);
  });
});
