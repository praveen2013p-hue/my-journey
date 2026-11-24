/**
 * Quality Score (0-100), BRIEF.md §9. All weights live in one place
 * (`QUALITY_WEIGHTS`) so tuning the formula never means hunting through the
 * codebase. A missing input scores 0 for its own criterion and flips
 * `partial: true` on the result — it never throws and never fakes a value.
 */

import type { Stage } from "./weinstein";

export const QUALITY_WEIGHTS = {
  grade: { A: 30, B: 20, C: 10 } as const,
  volume: { max: 15, cap: 3 },
  rs: { max: 15, cap: 20 },
  room: { max: 10, fullCreditAtOrBelowPct: 5, zeroCreditAtOrAbovePct: 15 },
  sector: { focus: 15, stage2RsPositive: 10, stage2: 5 },
  fundamentals: {
    salesGrowthYoY: { points: 5, mustExceedPct: 20 },
    epsGrowthYoY: { points: 5, mustExceedPct: 20 },
    roe: { points: 2.5, mustExceedPct: 15 },
    debtToEquity: { points: 2.5, mustBeBelow: 1 },
  },
} as const;

export type Grade = "A" | "B" | "C";

export interface SectorContext {
  isFocus: boolean;
  stage: Stage | null;
  mrs: number | null;
}

export interface FundamentalsInput {
  salesGrowthYoY: number | null;
  epsGrowthYoY: number | null;
  roe: number | null;
  debtToEquity: number | null;
}

export interface QualityInputs {
  grade: Grade;
  volRatio: number | null;
  mrs: number | null;
  overheadPct: number | null;
  /** The stock's constituent sectors/industries; the best one wins. */
  sectors: SectorContext[];
  /** Null when the alert carried no fundamentals at all (BRIEF.md §5b). */
  fundamentals: FundamentalsInput | null;
}

export interface QualityBreakdown {
  grade: number;
  volume: number;
  rs: number;
  room: number;
  sector: number;
  fundamentals: number;
}

export interface QualityResult {
  /** 0-100, rounded to the nearest whole number. */
  score: number;
  breakdown: QualityBreakdown;
  /** True if any criterion fell back to 0 for lack of data. */
  partial: boolean;
}

function scoreVolume(volRatio: number | null) {
  if (volRatio === null) return { points: 0, missing: true };
  const capped = Math.min(volRatio, QUALITY_WEIGHTS.volume.cap);
  const points = (capped / QUALITY_WEIGHTS.volume.cap) * QUALITY_WEIGHTS.volume.max;
  return { points, missing: false };
}

function scoreRs(mrs: number | null) {
  if (mrs === null) return { points: 0, missing: true };
  const clamped = Math.min(Math.max(mrs, 0), QUALITY_WEIGHTS.rs.cap);
  const points = (clamped / QUALITY_WEIGHTS.rs.cap) * QUALITY_WEIGHTS.rs.max;
  return { points, missing: false };
}

function scoreRoom(overheadPct: number | null) {
  if (overheadPct === null) return { points: 0, missing: true };
  const { max, fullCreditAtOrBelowPct, zeroCreditAtOrAbovePct } = QUALITY_WEIGHTS.room;
  if (overheadPct <= fullCreditAtOrBelowPct) return { points: max, missing: false };
  if (overheadPct >= zeroCreditAtOrAbovePct) return { points: 0, missing: false };
  const frac =
    (zeroCreditAtOrAbovePct - overheadPct) /
    (zeroCreditAtOrAbovePct - fullCreditAtOrBelowPct);
  return { points: max * frac, missing: false };
}

function scoreSector(sectors: SectorContext[]) {
  if (!sectors || sectors.length === 0) return { points: 0, missing: true };
  let best = 0;
  let anyKnown = false;
  for (const s of sectors) {
    if (s.isFocus) {
      best = Math.max(best, QUALITY_WEIGHTS.sector.focus);
      anyKnown = true;
      continue;
    }
    if (s.stage === 2) {
      anyKnown = true;
      const withPositiveRs = s.mrs !== null && s.mrs > 0;
      best = Math.max(
        best,
        withPositiveRs
          ? QUALITY_WEIGHTS.sector.stage2RsPositive
          : QUALITY_WEIGHTS.sector.stage2,
      );
    } else if (s.stage !== null) {
      anyKnown = true;
    }
  }
  return { points: best, missing: !anyKnown };
}

function scoreFundamentals(fundamentals: FundamentalsInput | null) {
  if (!fundamentals) return { points: 0, missing: true };
  const w = QUALITY_WEIGHTS.fundamentals;
  let points = 0;
  let missing = false;

  if (fundamentals.salesGrowthYoY !== null) {
    if (fundamentals.salesGrowthYoY > w.salesGrowthYoY.mustExceedPct) {
      points += w.salesGrowthYoY.points;
    }
  } else missing = true;

  if (fundamentals.epsGrowthYoY !== null) {
    if (fundamentals.epsGrowthYoY > w.epsGrowthYoY.mustExceedPct) {
      points += w.epsGrowthYoY.points;
    }
  } else missing = true;

  if (fundamentals.roe !== null) {
    if (fundamentals.roe > w.roe.mustExceedPct) points += w.roe.points;
  } else missing = true;

  if (fundamentals.debtToEquity !== null) {
    if (fundamentals.debtToEquity < w.debtToEquity.mustBeBelow) {
      points += w.debtToEquity.points;
    }
  } else missing = true;

  return { points, missing };
}

export function computeQualityScore(inputs: QualityInputs): QualityResult {
  const grade = QUALITY_WEIGHTS.grade[inputs.grade] ?? 0;
  const volume = scoreVolume(inputs.volRatio);
  const rs = scoreRs(inputs.mrs);
  const room = scoreRoom(inputs.overheadPct);
  const sector = scoreSector(inputs.sectors);
  const fundamentals = scoreFundamentals(inputs.fundamentals);

  const total = grade + volume.points + rs.points + room.points + sector.points + fundamentals.points;

  return {
    score: Math.min(100, Math.max(0, Math.round(total))),
    breakdown: {
      grade,
      volume: volume.points,
      rs: rs.points,
      room: room.points,
      sector: sector.points,
      fundamentals: fundamentals.points,
    },
    partial: volume.missing || rs.missing || room.missing || sector.missing || fundamentals.missing,
  };
}
