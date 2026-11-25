import type { RiskScoreResult } from "@/lib/risk-score";

const LABEL_TEXT: Record<NonNullable<RiskScoreResult["label"]>, string> = {
  "risk-on": "Risk-on",
  neutral: "Neutral",
  "risk-off": "Risk-off",
};

const LABEL_CLASS: Record<NonNullable<RiskScoreResult["label"]>, string> = {
  "risk-on": "text-pos",
  neutral: "text-warn",
  "risk-off": "text-neg",
};

function Gauge({ result }: { result: RiskScoreResult }) {
  if (result.score === null || result.label === null) {
    return <p className="text-sm text-muted">Not enough data yet.</p>;
  }
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <b className={`text-2xl font-semibold tabular-nums ${LABEL_CLASS[result.label]}`}>{result.score}</b>
        <span className={`text-sm font-medium ${LABEL_CLASS[result.label]}`}>{LABEL_TEXT[result.label]}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel-alt">
        <div
          className={`h-full ${result.label === "risk-on" ? "bg-pos" : result.label === "risk-off" ? "bg-neg" : "bg-warn"}`}
          style={{ width: `${result.score}%` }}
        />
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <div>
          <dt className="inline">Benchmark stage: </dt>
          <dd className="inline font-medium text-text">{result.regimeStage ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline">Sectors in Stage 2: </dt>
          <dd className="inline font-medium text-text">
            {result.breadthPct === null ? "—" : `${result.breadthPct.toFixed(0)}%`}
          </dd>
        </div>
        <div>
          <dt className="inline">Avg sector RS Δ (1W): </dt>
          <dd className="inline font-medium text-text">
            {result.avgRsChg1w === null ? "—" : result.avgRsChg1w.toFixed(1)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Composite Risk-On/Risk-Off score, DECISIONS.md backlog - a simple heuristic from the benchmark stage, sector breadth and sector momentum, not a calibrated model. */
export function RiskScoreCard({ india, us }: { india: RiskScoreResult; us: RiskScoreResult }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="Risk score">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Risk-on / Risk-off</h2>
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex-1">
          <h3 className="mb-1.5 text-sm font-semibold">India</h3>
          <Gauge result={india} />
        </div>
        <div className="flex-1">
          <h3 className="mb-1.5 text-sm font-semibold">US</h3>
          <Gauge result={us} />
        </div>
      </div>
    </section>
  );
}
