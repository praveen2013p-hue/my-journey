import { Chip } from "@/components/Chip";
import type { Market } from "@/lib/db/schema-types";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { HoldVsSoldSummary } from "@/lib/performance-data";

export function HoldVsSoldTable({ market, data }: { market: Market; data: HoldVsSoldSummary }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-panel p-5" aria-label="If I had held">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">If I had held</h2>
        <Chip variant="neutral">Indicative - site math, not TradingView&apos;s</Chip>
      </div>

      {data.rows.length === 0 ? (
        <p className="text-sm text-muted">No closed trades in this time frame yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted">Actual P&amp;L</div>
              <div className={`text-lg font-semibold ${data.totalActualPnl >= 0 ? "text-pos" : "text-neg"}`}>
                {formatMoney(market, data.totalActualPnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Hypothetical hold P&amp;L</div>
              <div className={`text-lg font-semibold ${data.totalHypotheticalHoldPnl >= 0 ? "text-pos" : "text-neg"}`}>
                {formatMoney(market, data.totalHypotheticalHoldPnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Exits that were too early</div>
              <div className="text-lg font-semibold">
                {data.pctSoldTooEarly !== null ? `${data.pctSoldTooEarly.toFixed(0)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Avg return left on the table</div>
              <div className="text-lg font-semibold text-neg">{formatPct(data.avgReturnLeftOnTable)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Stock</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Bought</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Sold</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Actual %</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Held-till-today %</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Diff (pts)</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Peak after sell</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.trade.id} className="border-b border-border/60 last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">{row.trade.ticker}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatMoney(market, row.trade.buy_price)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatMoney(market, row.trade.sell_price as number)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right ${row.actualReturnPct >= 0 ? "text-pos" : "text-neg"}`}>
                      {formatPct(row.actualReturnPct)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatPct(row.heldReturnPct)}</td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right ${row.diffPts !== null && row.diffPts > 0 ? "text-neg" : row.diffPts !== null ? "text-pos" : "text-muted"}`}
                    >
                      {row.diffPts !== null ? formatPct(row.diffPts) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {row.peakPriceAfterSell !== null ? formatMoney(market, row.peakPriceAfterSell) : "—"}
                      {row.pctMissedVsPeak !== null && row.pctMissedVsPeak > 0 && (
                        <span className="ml-1 text-xs text-muted">({formatPct(row.pctMissedVsPeak)} above sell)</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.verdict === "sold_too_early" && <Chip variant="amber">Sold too early</Chip>}
                      {row.verdict === "good_exit" && <Chip variant="green">Good exit</Chip>}
                      {row.verdict === "unknown" && <Chip variant="neutral">Price unavailable</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
