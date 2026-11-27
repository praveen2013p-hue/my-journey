"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format-money";
import { computeRetirementPensionEstimate } from "@/lib/nps-stats";

const DEFAULT_LUMP_SUM_PCT = 60;
const DEFAULT_ANNUITY_RATE_PCT = 6;

const FULL_DISCLAIMER =
  "NPS exit rules split the corpus into a lump-sum withdrawal and a mandatory annuity purchase - government subscribers must put at least 40% into the annuity; PFRDA's December 2025 amendment lowered that minimum to 20% for non-government subscribers. The annuity rate above is whatever you enter - real rates (roughly 5.5%-7.5% p.a. as of 2025-26) vary by insurer, plan, and your age at purchase, and this app has no live feed for them.";

/**
 * "If you retired today" what-if calculator, DECISIONS.md - NPS only,
 * shown nowhere else. Both inputs are the user's own assumptions, not
 * fixed facts this app knows: the lump-sum/annuity split is set by PFRDA
 * exit rules that just changed (Dec 2025 amendment lowered the
 * non-government minimum annuity share from 40% to 20%; government
 * subscribers stayed at a 40% minimum) and the annuity rate is whatever
 * the subscriber's chosen insurer/plan actually offers at the time -
 * nothing this app can look up. Defaults to 60%/6% (government-sector
 * minimum-lump-sum / a representative current market rate) purely as a
 * starting point to edit, never presented as the "correct" numbers.
 */
export function RetirementPensionEstimator({ currentValue }: { currentValue: number }) {
  const [lumpSumPctText, setLumpSumPctText] = useState(String(DEFAULT_LUMP_SUM_PCT));
  const [annuityRatePctText, setAnnuityRatePctText] = useState(String(DEFAULT_ANNUITY_RATE_PCT));

  const lumpSumPct = Number(lumpSumPctText);
  const annuityRatePct = Number(annuityRatePctText);
  const validInputs = Number.isFinite(lumpSumPct) && Number.isFinite(annuityRatePct);

  const estimate = validInputs ? computeRetirementPensionEstimate(currentValue, lumpSumPct, annuityRatePct) : null;

  if (currentValue <= 0) {
    return null;
  }

  return (
    <div className="min-w-0 rounded-lg border border-border-strong bg-panel-alt p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">If you retired today</span>
        {estimate && (
          <span className="text-lg font-semibold tabular-nums text-pos" title="Estimated monthly pension">
            {formatMoney("IN", estimate.monthlyPension)}/mo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          Lump sum
          <input
            type="number"
            min="0"
            max="100"
            step="any"
            value={lumpSumPctText}
            onChange={(e) => setLumpSumPctText(e.target.value)}
            aria-label="Lump sum withdrawal percent"
            className="min-h-[30px] w-14 rounded-md border border-border-strong bg-field px-1.5 text-sm text-text"
          />
          %
        </label>
        <label className="flex items-center gap-1.5">
          Annuity rate
          <input
            type="number"
            min="0"
            step="any"
            value={annuityRatePctText}
            onChange={(e) => setAnnuityRatePctText(e.target.value)}
            aria-label="Assumed annuity rate percent per year"
            className="min-h-[30px] w-14 rounded-md border border-border-strong bg-field px-1.5 text-sm text-text"
          />
          % p.a.
        </label>
        {estimate && (
          <span className="min-w-0 truncate">
            → {formatMoney("IN", estimate.lumpSumAmount)} lump sum + {formatMoney("IN", estimate.annuityAmount)} annuity
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted" title={FULL_DISCLAIMER}>
        Your own assumptions, not a quote - rates and rules vary by insurer/subscriber type and change over time.
      </p>
    </div>
  );
}
