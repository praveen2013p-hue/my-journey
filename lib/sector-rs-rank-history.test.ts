import { describe, expect, it } from "vitest";
import { computeSectorRsRankHistory } from "./sector-rs-rank-history";
import type { SnapshotLite } from "./sector-metrics";

const AS_OF = "2026-11-20";

describe("computeSectorRsRankHistory", () => {
  it("computes a per-checkpoint percentile pool - a sector's relative rank can differ at each of the 4 checkpoints", () => {
    const historyBySector: Record<string, SnapshotLite[]> = {
      A: [
        { weekEnding: "2026-10-16", stage: null, mrs: 10 },
        { weekEnding: "2026-10-30", stage: null, mrs: 1 },
        { weekEnding: "2026-11-13", stage: null, mrs: 5 },
        { weekEnding: "2026-11-20", stage: null, mrs: 1 },
      ],
      B: [
        { weekEnding: "2026-10-16", stage: null, mrs: 1 },
        { weekEnding: "2026-10-30", stage: null, mrs: 10 },
        { weekEnding: "2026-11-13", stage: null, mrs: 1 },
        { weekEnding: "2026-11-20", stage: null, mrs: 5 },
      ],
      C: [
        { weekEnding: "2026-10-16", stage: null, mrs: 5 },
        { weekEnding: "2026-10-30", stage: null, mrs: 5 },
        { weekEnding: "2026-11-13", stage: null, mrs: 10 },
        { weekEnding: "2026-11-20", stage: null, mrs: 10 },
      ],
    };

    const result = computeSectorRsRankHistory(historyBySector, AS_OF);

    // Checkpoint dates: 30d=2026-10-21 (resolves to 10-16 snapshot),
    // 15d=2026-11-05 (resolves to 10-30), 5d=2026-11-15 (resolves to
    // 11-13), 0d=2026-11-20 (resolves to 11-20 itself). Hand-verified
    // percentiles (n=3 sectors each checkpoint: 1/3->33, 2/3->67, 3/3->99):
    expect(result.A).toEqual([99, 33, 67, 33]);
    expect(result.B).toEqual([33, 99, 33, 67]);
    expect(result.C).toEqual([67, 67, 99, 99]);
  });

  it("returns null for a checkpoint with no snapshot at or before it, never approximating", () => {
    const historyBySector: Record<string, SnapshotLite[]> = {
      Bank: [
        { weekEnding: "2026-10-16", stage: null, mrs: 10 },
        { weekEnding: "2026-11-20", stage: null, mrs: 20 },
      ],
      // Only reports starting 2026-11-19 - after the 30d/15d/5d checkpoints,
      // but at-or-before the 0d (today) checkpoint.
      "New Sector": [{ weekEnding: "2026-11-19", stage: null, mrs: 15 }],
    };

    const result = computeSectorRsRankHistory(historyBySector, AS_OF);

    expect(result["New Sector"][0]).toBeNull();
    expect(result["New Sector"][1]).toBeNull();
    expect(result["New Sector"][2]).toBeNull();
    // At the 0d checkpoint, New Sector (mrs 15) and Bank's 11-20 snapshot don't both
    // exist - only "New Sector" (15) and Bank's latest is also 2026-11-20 (mrs 20).
    // Pool is {Bank: 20, New Sector: 15}; New Sector is the lower of 2 -> 1/2 -> 50.
    expect(result["New Sector"][3]).toBe(50);
  });

  it("a sector absent from a checkpoint's pool doesn't distort other sectors' percentiles there", () => {
    const historyBySector: Record<string, SnapshotLite[]> = {
      Bank: [{ weekEnding: "2026-10-16", stage: null, mrs: 10 }],
      IT: [{ weekEnding: "2026-10-16", stage: null, mrs: 20 }],
      // No snapshot at all until today - absent from every earlier checkpoint's pool.
      Pharma: [{ weekEnding: "2026-11-20", stage: null, mrs: 5 }],
    };

    const result = computeSectorRsRankHistory(historyBySector, AS_OF);
    // At the 30d checkpoint, only Bank and IT have resolved snapshots - a 2-sector pool.
    expect(result.Bank[0]).toBe(50); // 1 of 2 <= 10
    expect(result.IT[0]).toBe(99); // 2 of 2 <= 20
    expect(result.Pharma[0]).toBeNull();
  });

  it("returns an empty object for an empty input", () => {
    expect(computeSectorRsRankHistory({}, AS_OF)).toEqual({});
  });
});
