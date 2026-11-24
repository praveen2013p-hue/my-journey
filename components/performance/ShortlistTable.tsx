import { Chip, gradeVariant } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import type { Market } from "@/lib/db/schema-types";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { ShortlistRow, ShortlistSummary } from "@/lib/performance-data";

function Row({ market, row }: { market: Market; row: ShortlistRow }) {
  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2">
        <TradingViewLink exchange={row.alert.exchange} ticker={row.alert.ticker} />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <Chip variant={gradeVariant(row.alert.grade)}>{row.alert.grade}</Chip>
      </td>
      <td className="whitespace-nowrap px-3 py-2 capitalize">{row.alert.signal_type}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(market, row.alert.trigger_price)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {row.currentPrice !== null ? formatMoney(market, row.currentPrice) : "—"}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right ${(row.returnSinceTriggerPct ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
        {formatPct(row.returnSinceTriggerPct)}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right ${(row.maxGainSinceTriggerPct ?? 0) > 0 ? "text-pos" : "text-muted"}`}>
        {formatPct(row.maxGainSinceTriggerPct)}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right ${(row.maxDrawdownSinceTriggerPct ?? 0) < 0 ? "text-neg" : "text-muted"}`}>
        {formatPct(row.maxDrawdownSinceTriggerPct)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        {row.bought === "yes" ? <Chip variant="gold">Bought</Chip> : <Chip variant="neutral">Skipped</Chip>}
      </td>
    </tr>
  );
}

function MiniTable({ market, title, rows }: { market: Market; title: string; rows: ShortlistRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-semibold">Stock</th>
              <th className="px-3 py-2 text-left font-semibold">Grade</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-right font-semibold">Trigger</th>
              <th className="px-3 py-2 text-right font-semibold">Current</th>
              <th className="px-3 py-2 text-right font-semibold">Return</th>
              <th className="px-3 py-2 text-right font-semibold">Max gain</th>
              <th className="px-3 py-2 text-right font-semibold">Max drawdown</th>
              <th className="px-3 py-2 text-left font-semibold">Bought?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.alert.id} market={market} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtPctOrDash(value: number | null): string {
  return value !== null ? formatPct(value) : "—";
}

export function ShortlistTable({ market, data }: { market: Market; data: ShortlistSummary }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-panel p-5" aria-label="Shortlist performance">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
        Shortlist performance - every triggered stock, bought or not
      </h2>

      {data.rows.length === 0 ? (
        <p className="text-sm text-muted">No alerts triggered in this time frame yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <div className="text-xs text-muted">Avg return</div>
              <div className="text-lg font-semibold">{fmtPctOrDash(data.avgReturnPct)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">% in profit</div>
              <div className="text-lg font-semibold">
                {data.pctInProfit !== null ? `${data.pctInProfit.toFixed(0)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Avg A / B / C</div>
              <div className="text-sm font-semibold">
                {fmtPctOrDash(data.avgByGrade.A)} / {fmtPctOrDash(data.avgByGrade.B)} / {fmtPctOrDash(data.avgByGrade.C)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Breakouts vs Pullbacks</div>
              <div className="text-sm font-semibold">
                {fmtPctOrDash(data.avgBreakoutPct)} / {fmtPctOrDash(data.avgPullbackPct)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Bought vs Skipped</div>
              <div className="text-sm font-semibold">
                {fmtPctOrDash(data.avgBoughtPct)} / {fmtPctOrDash(data.avgSkippedPct)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MiniTable market={market} title="Top 10" rows={data.top10} />
            <MiniTable market={market} title="Bottom 10" rows={data.bottom10} />
          </div>

          <MiniTable market={market} title="All triggered stocks in range" rows={data.rows} />
        </>
      )}
    </section>
  );
}
