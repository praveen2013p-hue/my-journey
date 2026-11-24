"use client";

import { Chip } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import type { Market } from "@/lib/db/schema-types";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { MarketOpenTradesData } from "@/lib/dashboard-open-trades";
import { quoteKey, useQuotes } from "@/lib/use-quotes";

function livePriceFor(
  quotes: Map<string, { price: number }>,
  market: Market,
  row: MarketOpenTradesData["rows"][number],
): number | null {
  if (!row.providerSymbol) return null;
  return quotes.get(quoteKey(market, row.providerSymbol))?.price ?? null;
}

function MarketSection({ market, data }: { market: Market; data: MarketOpenTradesData }) {
  const quotes = useQuotes(data.rows.map((r) => ({ market, symbol: r.providerSymbol })));

  const livePrices = data.rows.map((row) => livePriceFor(quotes, market, row));
  const knownPrices = livePrices.filter((p): p is number => p !== null);
  const anyLive = knownPrices.length > 0;
  const unrealized = data.rows.reduce((sum, row, i) => {
    const live = livePrices[i];
    return live === null ? sum : sum + (live - row.trade.buy_price) * row.trade.quantity;
  }, 0);

  return (
    <div className="flex-1">
      <h3 className="mb-2.5 text-sm font-semibold">Open trades · {market === "IN" ? "India (₹)" : "US ($)"}</h3>
      {data.rows.length === 0 ? (
        <p className="text-sm text-muted">No open trades.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Stock</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Strategy</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Buy</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Live</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => {
                const livePrice = livePrices[i];
                const pnlPct =
                  livePrice !== null ? ((livePrice - row.trade.buy_price) / row.trade.buy_price) * 100 : null;
                return (
                  <tr key={row.trade.id} className="border-b border-border/60 last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.exchange ? (
                        <TradingViewLink exchange={row.exchange} ticker={row.trade.ticker} />
                      ) : (
                        <span className="font-semibold">{row.trade.ticker}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Chip variant="gold">{row.strategyTagName}</Chip>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatMoney(market, row.trade.buy_price)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {livePrice !== null ? formatMoney(market, livePrice) : "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right ${pnlPct !== null && pnlPct >= 0 ? "text-pos" : pnlPct !== null ? "text-neg" : "text-muted"}`}
                    >
                      {formatPct(pnlPct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3.5">
        <div>
          <div className="text-xs text-muted">{market === "IN" ? "India unrealised" : "US unrealised"}</div>
          <div className={`text-lg font-semibold ${anyLive && unrealized >= 0 ? "text-pos" : anyLive ? "text-neg" : "text-muted"}`}>
            {anyLive ? formatMoney(market, unrealized) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{market === "IN" ? "India realised" : "US realised"}</div>
          <div className={`text-lg font-semibold ${data.realizedPnl >= 0 ? "text-pos" : "text-neg"}`}>
            {formatMoney(market, data.realizedPnl)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpenTradesCard({
  india,
  us,
}: {
  india: MarketOpenTradesData;
  us: MarketOpenTradesData;
}) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="Open trades and P&amp;L">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Open trades &amp; P&amp;L</h2>
      <div className="flex flex-col gap-6 lg:flex-row">
        <MarketSection market="IN" data={india} />
        <MarketSection market="US" data={us} />
      </div>
    </section>
  );
}
