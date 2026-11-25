/**
 * "Quality Score calibration vs realized P&L" (DECISIONS.md backlog):
 * whether the Grade/Quality Score this app assigns at trigger time
 * actually predicts what happened to the trade - not assumed, checked
 * against closed trades that were logged from an alert (`trade.alert_id`
 * set). A trade added manually, or from a constituent that never
 * triggered an alert, has no grade/score to calibrate against and is
 * simply left out - never guessed.
 */

import type { AlertRow, Grade } from "./db/schema-types";
import type { ClosedTradeResult } from "./trade-stats";

export interface GradeCalibrationRow {
  grade: Grade;
  tradeCount: number;
  winRate: number;
  avgPnlPct: number;
  /** Null if none of this grade's closed trades had a stop-loss set. */
  avgRMultiple: number | null;
}

export interface QualityScoreBucketRow {
  label: string;
  tradeCount: number;
  winRate: number;
  avgPnlPct: number;
  avgRMultiple: number | null;
}

interface CalibratedTrade {
  closed: ClosedTradeResult;
  alert: AlertRow;
}

function calibratedTrades(closedTrades: ClosedTradeResult[], alertById: Map<string, AlertRow>): CalibratedTrade[] {
  const result: CalibratedTrade[] = [];
  for (const closed of closedTrades) {
    if (!closed.trade.alert_id) continue;
    const alert = alertById.get(closed.trade.alert_id);
    if (!alert) continue;
    result.push({ closed, alert });
  }
  return result;
}

function summarize(trades: CalibratedTrade[]): Pick<GradeCalibrationRow, "tradeCount" | "winRate" | "avgPnlPct" | "avgRMultiple"> {
  const n = trades.length;
  const wins = trades.filter((t) => t.closed.pnlPct > 0).length;
  const withR = trades.filter((t) => t.closed.rMultiple !== null);
  return {
    tradeCount: n,
    winRate: (wins / n) * 100,
    avgPnlPct: trades.reduce((s, t) => s + t.closed.pnlPct, 0) / n,
    avgRMultiple: withR.length > 0 ? withR.reduce((s, t) => s + t.closed.rMultiple!, 0) / withR.length : null,
  };
}

export function computeGradeCalibration(
  closedTrades: ClosedTradeResult[],
  alertById: Map<string, AlertRow>,
): GradeCalibrationRow[] {
  const byGrade = new Map<Grade, CalibratedTrade[]>();
  for (const t of calibratedTrades(closedTrades, alertById)) {
    const list = byGrade.get(t.alert.grade) ?? [];
    list.push(t);
    byGrade.set(t.alert.grade, list);
  }

  return Array.from(byGrade.entries())
    .map(([grade, trades]) => ({ grade, ...summarize(trades) }))
    .sort((a, b) => a.grade.localeCompare(b.grade));
}

const QUALITY_SCORE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0-39", min: 0, max: 39 },
  { label: "40-59", min: 40, max: 59 },
  { label: "60-79", min: 60, max: 79 },
  { label: "80-100", min: 80, max: 100 },
];

export function computeQualityScoreCalibration(
  closedTrades: ClosedTradeResult[],
  alertById: Map<string, AlertRow>,
): QualityScoreBucketRow[] {
  const rows: QualityScoreBucketRow[] = [];
  const trades = calibratedTrades(closedTrades, alertById).filter((t) => t.alert.quality_score !== null);

  for (const bucket of QUALITY_SCORE_BUCKETS) {
    const inBucket = trades.filter(
      (t) => t.alert.quality_score! >= bucket.min && t.alert.quality_score! <= bucket.max,
    );
    if (inBucket.length === 0) continue;
    rows.push({ label: bucket.label, ...summarize(inBucket) });
  }
  return rows;
}
