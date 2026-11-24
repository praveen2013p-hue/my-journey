import { formatMoney, formatPct } from "@/lib/format-money";
import type { Market } from "@/lib/db/schema-types";
import type { StrategyResult } from "@/lib/trade-stats";

export function StrategyResultsTable({ market, results }: { market: Market; results: StrategyResult[] }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-5" aria-label="Results by strategy">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Results by strategy</h2>
      {results.length === 0 ? (
        <p className="text-sm text-muted">Close a trade to see per-strategy results here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-3 py-2.5 text-left font-semibold">Strategy tag</th>
                <th className="px-3 py-2.5 text-right font-semibold">Trades</th>
                <th className="px-3 py-2.5 text-right font-semibold">Win rate</th>
                <th className="px-3 py-2.5 text-right font-semibold">Avg return</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.tagId ?? "untagged"} className="border-b border-border/60">
                  <td className="px-3 py-2.5 font-semibold">{r.tagName}</td>
                  <td className="px-3 py-2.5 text-right">{r.tradeCount}</td>
                  <td className="px-3 py-2.5 text-right">{r.winRate !== null ? `${r.winRate.toFixed(0)}%` : "—"}</td>
                  <td className={`px-3 py-2.5 text-right ${r.avgReturnPct >= 0 ? "text-pos" : "text-neg"}`}>
                    {formatPct(r.avgReturnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${r.totalPnl >= 0 ? "text-pos" : "text-neg"}`}>
                    {formatMoney(market, r.totalPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Create your own strategy tags while adding a trade, or in Settings.</p>
    </section>
  );
}
