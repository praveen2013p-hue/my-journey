import { describe, expect, it } from "vitest";
import { BACKFILL_STORED_WEEKS, computeBackfillWeeks, type WeeklyClose } from "./sector-backfill";

function weeklyUptrend(count: number, startWeekIndex = 0): WeeklyClose[] {
  const rows: WeeklyClose[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    close *= 1.01; // steady uptrend, same shape across sector and benchmark unless scaled differently
    const date = new Date(Date.UTC(2020, 0, 3 + (startWeekIndex + i) * 7));
    rows.push({ weekEnding: date.toISOString().slice(0, 10), close: Math.round(close * 100) / 100 });
  }
  return rows;
}

describe("computeBackfillWeeks", () => {
  it("only returns the most recent BACKFILL_STORED_WEEKS rows even with more lookback supplied", () => {
    const closes = weeklyUptrend(BACKFILL_STORED_WEEKS + 100);
    const rows = computeBackfillWeeks(closes, closes);
    expect(rows).toHaveLength(BACKFILL_STORED_WEEKS);
    expect(rows[0].weekEnding).toBe(closes[100].weekEnding);
    expect(rows.at(-1)!.weekEnding).toBe(closes.at(-1)!.weekEnding);
  });

  it("returns fewer rows than BACKFILL_STORED_WEEKS when less history is available, without throwing", () => {
    const closes = weeklyUptrend(40);
    const rows = computeBackfillWeeks(closes, closes);
    expect(rows).toHaveLength(40);
  });

  it("produces a non-null stage once enough bars exist for the 30W MA", () => {
    const closes = weeklyUptrend(BACKFILL_STORED_WEEKS + 160);
    const rows = computeBackfillWeeks(closes, closes);
    expect(rows.at(-1)!.stage).not.toBeNull();
    // A steady uptrend above its own rising MA should read as Stage 2.
    expect(rows.at(-1)!.stage).toBe(2);
  });

  it("leaves mrs null when the benchmark has no matching weeks, but still computes stage", () => {
    const closes = weeklyUptrend(BACKFILL_STORED_WEEKS + 160);
    const rows = computeBackfillWeeks(closes, []);
    expect(rows.at(-1)!.mrs).toBeNull();
    expect(rows.at(-1)!.stage).not.toBeNull();
  });

  it("computes a non-null mrs once the benchmark is aligned and the 52-week RS average has warmed up", () => {
    const sectorCloses = weeklyUptrend(BACKFILL_STORED_WEEKS + 160, 0);
    // Benchmark rises slower, so the sector should show positive relative strength.
    const benchCloses = sectorCloses.map((c, i) => ({ weekEnding: c.weekEnding, close: 100 * 1.004 ** i }));
    const rows = computeBackfillWeeks(sectorCloses, benchCloses);
    const last = rows.at(-1)!;
    expect(last.mrs).not.toBeNull();
    expect(last.mrs!).toBeGreaterThan(0);
  });

  it("tolerates a benchmark that only has some of the weeks (gaps don't crash alignment)", () => {
    const sectorCloses = weeklyUptrend(BACKFILL_STORED_WEEKS + 160);
    const benchCloses = sectorCloses.filter((_, i) => i % 2 === 0);
    expect(() => computeBackfillWeeks(sectorCloses, benchCloses)).not.toThrow();
  });

  it("sets focus true only when stage 2 and mrs/delta4/delta13 are all positive", () => {
    const sectorCloses = weeklyUptrend(BACKFILL_STORED_WEEKS + 160);
    const benchCloses = sectorCloses.map((c, i) => ({ weekEnding: c.weekEnding, close: 100 * 1.002 ** i }));
    const rows = computeBackfillWeeks(sectorCloses, benchCloses);
    const last = rows.at(-1)!;
    expect(last.focus).toBe(last.stage === 2 && (last.mrs ?? 0) > 0 && (last.chg4 ?? 0) > 0);
  });
});
