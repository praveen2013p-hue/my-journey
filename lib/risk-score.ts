/**
 * "Composite Risk-On/Risk-Off score" (DECISIONS.md backlog): one number
 * from three signals this app already computes separately - the
 * benchmark's Weinstein stage (lib/regime.ts), what share of sectors are
 * in Stage 2 (a sector-level stand-in for market breadth - true
 * stock-level breadth isn't buildable yet, DECISIONS.md), and sectors'
 * average 1-week Mansfield RS change (momentum). This is a simple,
 * documented heuristic, not a calibrated model - the weights and the
 * momentum scaling factor are judgment calls, not derived from data.
 */

import { getMarketRegime } from "./regime";
import { listSectorMap } from "./db/sector-map";
import { getLatestSectorWeekEnding, listRecentSectorSnapshotHistory, listSectorMetricsForWeek } from "./db/sectors";
import type { Market } from "./db/schema-types";
import type { Stage } from "./weinstein";

export type RiskLabel = "risk-on" | "neutral" | "risk-off";

export interface RiskScoreInputs {
  regimeStage: Stage | null;
  /** % of sectors in Stage 2 this week, 0-100. */
  breadthPct: number | null;
  /** Average 1-week Mansfield RS change across sectors. */
  avgRsChg1w: number | null;
}

export interface RiskScoreResult extends RiskScoreInputs {
  market: Market;
  weekEnding: string | null;
  /** 0-100, or null if none of the three inputs were available. */
  score: number | null;
  label: RiskLabel | null;
}

/** Stage 1 is early/unproven, Stage 2 strong, Stage 3 topping, Stage 4 weak - not a linear scale. */
const REGIME_STAGE_SCORE: Record<Stage, number> = { 1: 50, 2: 90, 3: 30, 4: 10 };

/** A sector's RS change of +/-10 points in a week is already a big move - scaling by 5 maps roughly that range onto the 0-100 scale, centered on 50. */
const MOMENTUM_SCALE = 5;

export function computeRiskScore(inputs: RiskScoreInputs): { score: number | null; label: RiskLabel | null } {
  const components: number[] = [];
  if (inputs.regimeStage !== null) components.push(REGIME_STAGE_SCORE[inputs.regimeStage]);
  if (inputs.breadthPct !== null) components.push(inputs.breadthPct);
  if (inputs.avgRsChg1w !== null) {
    components.push(Math.min(100, Math.max(0, 50 + inputs.avgRsChg1w * MOMENTUM_SCALE)));
  }

  if (components.length === 0) return { score: null, label: null };

  const score = Math.round(components.reduce((sum, v) => sum + v, 0) / components.length);
  const label: RiskLabel = score >= 66 ? "risk-on" : score <= 34 ? "risk-off" : "neutral";
  return { score, label };
}

export async function getRiskScore(market: Market): Promise<RiskScoreResult> {
  const weekEnding = await getLatestSectorWeekEnding(market);
  if (!weekEnding) {
    return { market, weekEnding: null, regimeStage: null, breadthPct: null, avgRsChg1w: null, score: null, label: null };
  }

  const [regime, sectorMapRows, snapshotsThisWeek, metricsThisWeek] = await Promise.all([
    getMarketRegime(market),
    listSectorMap(market),
    listRecentSectorSnapshotHistory(market, weekEnding),
    listSectorMetricsForWeek(market, weekEnding),
  ]);

  const sectorNames = new Set(sectorMapRows.filter((r) => r.kind === "sector").map((r) => r.display_name));

  const stagesKnown = snapshotsThisWeek.filter(
    (s) => sectorNames.has(s.sector) && s.week_ending === weekEnding && s.stage !== null,
  );
  const breadthPct =
    stagesKnown.length > 0 ? (stagesKnown.filter((s) => s.stage === 2).length / stagesKnown.length) * 100 : null;

  const rsChgValues = metricsThisWeek
    .filter((m) => sectorNames.has(m.sector))
    .map((m) => m.rs_chg_1w)
    .filter((v): v is number => v !== null);
  const avgRsChg1w = rsChgValues.length > 0 ? rsChgValues.reduce((sum, v) => sum + v, 0) / rsChgValues.length : null;

  const inputs: RiskScoreInputs = { regimeStage: regime.stage, breadthPct, avgRsChg1w };
  const { score, label } = computeRiskScore(inputs);

  return { market, weekEnding, ...inputs, score, label };
}
