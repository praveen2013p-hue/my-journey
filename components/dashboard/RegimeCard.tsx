"use client";

import type { MarketRegime } from "@/lib/regime";
import { useMarketRegimes } from "@/lib/use-regime";

const STAGE_DESCRIPTION: Record<number, string> = {
  1: "Flat 30-week average, base-building",
  2: "Above a rising 30-week average",
  3: "30-week average flattening, price weakening",
  4: "Below a falling 30-week average",
};

function dotClass(stage: number | null): string {
  if (stage === 2) return "bg-pos";
  if (stage === 1) return "bg-stage1";
  if (stage === 3 || stage === 4) return "bg-neg";
  return "bg-border-strong";
}

function chipClass(stage: number | null): string {
  if (stage === 2) return "text-pos border-pos-border bg-pos-wash";
  if (stage === 1) return "text-stage1 border-stage1-border bg-stage1-wash";
  if (stage === 3) return "text-warn border-warn-border bg-warn-wash";
  if (stage === 4) return "text-neg border-neg-border bg-neg-wash";
  return "text-muted border-border-strong bg-chip-neutral";
}

function Row({ label, name, regime }: { label: string; name: string; regime: MarketRegime }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className={`inline-block h-4 w-4 rounded-full ${dotClass(regime.stage)}`} />
      <div className="flex-1">
        <div className="font-semibold">{label} · {name}</div>
        <div className="text-xs text-muted">
          {regime.stage !== null ? STAGE_DESCRIPTION[regime.stage] : "Not enough history yet"}
        </div>
      </div>
      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${chipClass(regime.stage)}`}>
        {regime.stage !== null ? `Stage ${regime.stage}` : "—"}
      </span>
    </div>
  );
}

/** Fetches the regime client-side (see DECISIONS.md) instead of the Dashboard page awaiting it server-side. */
export function RegimeCard() {
  const { india, us } = useMarketRegimes();
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="Market regime">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Market regime</h2>
      <div className="flex flex-col gap-4">
        <Row label="India" name="Nifty Total Market" regime={india} />
        <Row label="US" name="S&P 500" regime={us} />
        <div className="text-xs text-muted">Green = Stage 2 · Amber = Stage 1 · Red = Stage 3 or 4</div>
      </div>
    </section>
  );
}
