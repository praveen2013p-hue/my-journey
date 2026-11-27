"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format-money";
import { computeRetirementPensionEstimate } from "@/lib/nps-stats";

const DEFAULT_LUMP_SUM_PCT = 60;
const DEFAULT_ANNUITY_RATE_PCT = 6;

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
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        If you retired today
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Lump sum withdrawal (%)
          <input
            type="number"
            min="0"
            max="100"
            step="any"
            value={lumpSumPctText}
            onChange={(e) => setLumpSumPctText(e.target.value)}
            className="min-h-[36px] w-24 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Assumed annuity rate (% p.a.)
          <input
            type="number"
            min="0"
            step="any"
            value={annuityRatePctText}
            onChange={(e) => setAnnuityRatePctText(e.target.value)}
            className="min-h-[36px] w-28 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
          />
        </label>
      </div>

      {estimate && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <div className="text-xs text-muted">Lump sum withdrawal</div>
            <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums">
              {formatMoney("IN", estimate.lumpSumAmount)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Annuity purchase</div>
            <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums">
              {formatMoney("IN", estimate.annuityAmount)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Estimated monthly pension</div>
            <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-pos">
              {formatMoney("IN", estimate.monthlyPension)}/mo
            </div>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-snug text-muted">
        Your own estimate, not a quote: NPS exit rules split the corpus into a lump-sum withdrawal and a mandatory
        annuity purchase - government subscribers must put at least 40% into the annuity; PFRDA&apos;s December 2025
        amendment lowered that minimum to 20% for non-government subscribers. The annuity rate above is whatever you
        enter - real rates (roughly 5.5%-7.5% p.a. as of 2025-26) vary by insurer, plan, and your age at purchase, and
        this app has no live feed for them. Confirm the current rule and get a real quote before relying on this.
      </p>
    </div>
  );
}
