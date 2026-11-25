import { formatPct } from "@/lib/format-money";
import type { QualityCalibrationData } from "@/lib/performance-data";

function Row({
  label,
  tradeCount,
  winRate,
  avgPnlPct,
  avgRMultiple,
}: {
  label: string;
  tradeCount: number;
  winRate: number;
  avgPnlPct: number;
  avgRMultiple: number | null;
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-3 py-2.5 font-semibold">{label}</td>
      <td className="px-3 py-2.5 text-right">{tradeCount}</td>
      <td className="px-3 py-2.5 text-right">{winRate.toFixed(0)}%</td>
      <td className={`px-3 py-2.5 text-right ${avgPnlPct >= 0 ? "text-pos" : "text-neg"}`}>{formatPct(avgPnlPct)}</td>
      <td className="px-3 py-2.5 text-right">
        {avgRMultiple === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={avgRMultiple >= 0 ? "text-pos" : "text-neg"}>
            {avgRMultiple >= 0 ? "+" : ""}
            {avgRMultiple.toFixed(2)}R
          </span>
        )}
      </td>
    </tr>
  );
}

/** "Quality Score calibration" (DECISIONS.md backlog) - does Grade/Quality Score at trigger time actually predict what happened, checked against closed trades logged from an alert. */
export function QualityCalibrationTable({ data }: { data: QualityCalibrationData }) {
  const hasData = data.byGrade.length > 0 || data.byQualityScore.length > 0;

  return (
    <section className="rounded-xl border border-border bg-panel p-5" aria-label="Quality Score calibration">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Quality Score calibration</h2>
      {!hasData ? (
        <p className="text-sm text-muted">
          Close a trade that was logged from a Breakouts/Pullbacks alert to see whether its Grade and Quality Score
          predicted the outcome.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {data.byGrade.length > 0 && (
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-xs font-semibold text-muted">By grade</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="px-3 py-2.5 text-left font-semibold">Grade</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Trades</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Win rate</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Avg return</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byGrade.map((r) => (
                    <Row key={r.grade} label={r.grade} {...r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.byQualityScore.length > 0 && (
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-xs font-semibold text-muted">By Quality Score</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="px-3 py-2.5 text-left font-semibold">Score</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Trades</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Win rate</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Avg return</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byQualityScore.map((r) => (
                    <Row key={r.label} {...r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {data.uncalibratedCount > 0 && (
        <p className="mt-3 text-xs text-muted">
          {data.uncalibratedCount} closed trade{data.uncalibratedCount === 1 ? "" : "s"} in this window weren&apos;t
          logged from an alert, so they&apos;re left out here.
        </p>
      )}
    </section>
  );
}
