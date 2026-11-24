import { describe, expect, it } from "vitest";
import { computeSectorRanking, isFocusSector, type SnapshotLite } from "./sector-metrics";

function weeksAgo(latest: string, n: number): string {
  const [y, m, d] = latest.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - n * 7);
  return date.toISOString().slice(0, 10);
}

const LATEST = "2026-11-20";

describe("isFocusSector", () => {
  it("requires stage 2, positive RS, and improving RS over both 4 and 13 weeks", () => {
    expect(isFocusSector({ stage: 2, mrs: 5, delta4: 1, delta13: 1 })).toBe(true);
  });
  it("fails if any one condition is missing", () => {
    expect(isFocusSector({ stage: 3, mrs: 5, delta4: 1, delta13: 1 })).toBe(false);
    expect(isFocusSector({ stage: 2, mrs: -1, delta4: 1, delta13: 1 })).toBe(false);
    expect(isFocusSector({ stage: 2, mrs: 5, delta4: -1, delta13: 1 })).toBe(false);
    expect(isFocusSector({ stage: 2, mrs: 5, delta4: 1, delta13: null })).toBe(false);
  });
});

describe("computeSectorRanking", () => {
  it("computes Δ4/13/26/52 from historical snapshots exactly N weeks back", () => {
    const history: SnapshotLite[] = [52, 26, 13, 4, 0].map((n) => ({
      weekEnding: weeksAgo(LATEST, n),
      stage: 2,
      mrs: 10 - n * 0.1, // mrs rises steadily as we approach "today"
    }));
    const result = computeSectorRanking({ "PSU Bank": history }, LATEST);
    const row = result[0];
    expect(row.mrs).toBeCloseTo(10, 5);
    expect(row.delta4).toBeCloseTo(0.4, 5);
    expect(row.delta13).toBeCloseTo(1.3, 5);
    expect(row.delta26).toBeCloseTo(2.6, 5);
    expect(row.delta52).toBeCloseTo(5.2, 5);
  });

  it("returns null deltas when there isn't enough history, rather than guessing", () => {
    const history: SnapshotLite[] = [{ weekEnding: LATEST, stage: 2, mrs: 5 }];
    const row = computeSectorRanking({ Bank: history }, LATEST)[0];
    expect(row.delta4).toBeNull();
    expect(row.delta13).toBeNull();
  });

  it("tolerates a missed week by using the closest earlier snapshot", () => {
    // No snapshot exactly 4 weeks back, but one 5 weeks back exists.
    const history: SnapshotLite[] = [
      { weekEnding: weeksAgo(LATEST, 5), stage: 2, mrs: 3 },
      { weekEnding: LATEST, stage: 2, mrs: 8 },
    ];
    const row = computeSectorRanking({ Bank: history }, LATEST)[0];
    expect(row.delta4).toBeCloseTo(5, 5);
  });

  it("marks is_focus true only when stage 2, RS positive, and both short deltas improving", () => {
    const risingHistory: SnapshotLite[] = [13, 4, 0].map((n) => ({
      weekEnding: weeksAgo(LATEST, n),
      stage: 2,
      mrs: 5 + (13 - n) * 0.5,
    }));
    const flatStage1History: SnapshotLite[] = [13, 4, 0].map((n) => ({
      weekEnding: weeksAgo(LATEST, n),
      stage: 1,
      mrs: 5 + (13 - n) * 0.5,
    }));
    const result = computeSectorRanking(
      { "PSU Bank": risingHistory, IT: flatStage1History },
      LATEST,
    );
    expect(result.find((r) => r.sector === "PSU Bank")?.isFocus).toBe(true);
    expect(result.find((r) => r.sector === "IT")?.isFocus).toBe(false);
  });

  it("ranks sectors by mrs descending and computes rank_move_1w vs the previous week", () => {
    const prevWeek = weeksAgo(LATEST, 1);
    // Last week: PSU Bank #1, Bank #2. This week they swap.
    const history: Record<string, SnapshotLite[]> = {
      "PSU Bank": [
        { weekEnding: prevWeek, stage: 2, mrs: 10 },
        { weekEnding: LATEST, stage: 2, mrs: 4 },
      ],
      Bank: [
        { weekEnding: prevWeek, stage: 2, mrs: 8 },
        { weekEnding: LATEST, stage: 2, mrs: 12 },
      ],
    };
    const result = computeSectorRanking(history, LATEST);
    const bank = result.find((r) => r.sector === "Bank")!;
    const psuBank = result.find((r) => r.sector === "PSU Bank")!;

    expect(bank.rank).toBe(1);
    expect(psuBank.rank).toBe(2);
    // Bank moved from #2 to #1 -> +1 (moved up one place)
    expect(bank.rankMove1w).toBe(1);
    // PSU Bank moved from #1 to #2 -> -1 (moved down one place)
    expect(psuBank.rankMove1w).toBe(-1);
  });

  it("rs_chg_1w is this week's mrs minus last week's, dash-equivalent (null) with only one snapshot", () => {
    const prevWeek = weeksAgo(LATEST, 1);
    const withHistory = computeSectorRanking(
      { Bank: [{ weekEnding: prevWeek, stage: 2, mrs: 8 }, { weekEnding: LATEST, stage: 2, mrs: 12 }] },
      LATEST,
    )[0];
    expect(withHistory.rsChg1w).toBeCloseTo(4, 5);

    const onlyOne = computeSectorRanking({ Bank: [{ weekEnding: LATEST, stage: 2, mrs: 12 }] }, LATEST)[0];
    expect(onlyOne.rsChg1w).toBeNull();
  });

  it("a sector with no mrs at all ranks last, not crashing the sort", () => {
    const result = computeSectorRanking(
      {
        Bank: [{ weekEnding: LATEST, stage: 2, mrs: 5 }],
        Unknown: [{ weekEnding: LATEST, stage: null, mrs: null }],
      },
      LATEST,
    );
    expect(result.find((r) => r.sector === "Unknown")?.rank).toBeNull();
    expect(result.find((r) => r.sector === "Bank")?.rank).toBe(1);
  });
});
