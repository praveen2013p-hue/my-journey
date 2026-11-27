import { Chip } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import type { Market } from "@/lib/db/schema-types";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { ClosedTradeRowView } from "@/lib/journal-data";

/**
 * Closed trades grouped by the year each one closed - like a mutual
 * fund's yearly statement: per-year totals, then every trade in it with
 * how long it was held and what it booked (direct ask, not in BRIEF.md
 * §7.4 - DECISIONS.md).
 */
export function YearlyTradesTable({
  market,
  closedTrades,
}: {
  market: Market;
  closedTrades: ClosedTradeRowView[];
}) {
  if (closedTrades.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        No closed trades yet - once you close one it shows up here, grouped by the year it closed.
      </p>
    );
  }

  const byYear = new Map<string, ClosedTradeRowView[]>();
  for (const row of closedTrades) {
    const year = (row.trade.sell_date as string).slice(0, 4);
    const list = byYear.get(year) ?? [];
    list.push(row);
    byYear.set(year, list);
  }
  // closedTrades already arrives newest-sell-date-first, so each year's
  // rows stay newest-first too.
  const years = Array.from(byYear.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="flex flex-col gap-5">
      {years.map(([year, rows]) => {
        const totalPnl = rows.reduce((sum, r) => sum + r.pnlAbs, 0);
        const wins = rows.filter((r) => r.pnlAbs > 0).length;
        const winRate = (wins / rows.length) * 100;
        const avgDays = rows.reduce((sum, r) => sum + r.holdingDays, 0) / rows.length;

        return (
          <section key={year} className="rounded-xl border border-border bg-panel p-5">
            <div className="mb-3.5 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{year}</h2>
              <Chip variant="neutral">
                {rows.length} trade{rows.length === 1 ? "" : "s"}
              </Chip>
              <Chip variant={totalPnl >= 0 ? "green" : "red"}>{formatMoney(market, totalPnl)}</Chip>
              <span className="text-xs text-muted">{winRate.toFixed(0)}% win rate</span>
              <span className="text-xs text-muted">avg {avgDays.toFixed(0)} days held</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Stock</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Strategy</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Buy date</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Sell date</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Days</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">P&amp;L</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">P&amp;L %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.trade.id} className="border-b border-border/60">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {row.exchange ? (
                          <TradingViewLink exchange={row.exchange} ticker={row.trade.ticker} />
                        ) : (
                          <span className="font-semibold">{row.trade.ticker}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Chip variant="gold">{row.strategyTagName}</Chip>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{row.trade.buy_date}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{row.trade.sell_date}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">{row.holdingDays}</td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 text-right ${row.pnlAbs >= 0 ? "text-pos" : "text-neg"}`}
                      >
                        {formatMoney(market, row.pnlAbs)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 text-right ${row.pnlPct >= 0 ? "text-pos" : "text-neg"}`}
                      >
                        {formatPct(row.pnlPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
