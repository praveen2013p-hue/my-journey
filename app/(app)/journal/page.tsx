import Link from "next/link";
import { AddTradeModal } from "@/components/journal/AddTradeModal";
import { PnlCalendar } from "@/components/journal/PnlCalendar";
import { ResetAllButton } from "@/components/journal/ResetAllButton";
import { StrategyResultsTable } from "@/components/journal/StrategyResultsTable";
import { ClosedTradesTable, OpenTradesTable } from "@/components/journal/TradesTable";
import { Chip } from "@/components/Chip";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import type { Market } from "@/lib/db/schema-types";
import { formatMoney, formatPct } from "@/lib/format-money";
import { getFreshnessData } from "@/lib/freshness-data";
import { getJournalPageData } from "@/lib/journal-data";
import { todayInMarketTimezone } from "@/lib/time";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; tab?: string }>;
}) {
  const session = await verifySession();
  const sp = await searchParams;
  const market: Market = sp.market === "US" ? "US" : "IN";
  const tab: "open" | "closed" = sp.tab === "closed" ? "closed" : "open";

  const [freshness, data] = await Promise.all([getFreshnessData(), getJournalPageData(session.userId, market)]);

  const tabSuffix = (t: "open" | "closed") => `/journal?market=${market}&tab=${t}`;
  const marketSuffix = (m: Market) => `/journal?market=${m}&tab=${tab}`;

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader
        title="Journal"
        subtitle="Your own trades · separate from your wife's journal"
        actions={
          <>
            <AddTradeModal
              market={market}
              tickerOptions={data.tickerOptions}
              strategyTagNames={data.strategyTags.map((t) => t.name)}
            />
            <ResetAllButton market={market} tradeCount={data.openTrades.length + data.closedTrades.length} />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={marketSuffix("IN")}
          className={`rounded-full border px-3.5 py-1.5 font-medium ${market === "IN" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
        >
          India ₹
        </Link>
        <Link
          href={marketSuffix("US")}
          className={`rounded-full border px-3.5 py-1.5 font-medium ${market === "US" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
        >
          US $
        </Link>
        <span className="ml-2 text-xs text-muted">India and US are never combined</span>
      </div>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="text-xs text-muted">Win rate</div>
          <div className={`mt-1.5 text-[30px] font-semibold tracking-tight ${data.stats.winRate !== null && data.stats.winRate >= 50 ? "text-pos" : "text-text"}`}>
            {data.stats.winRate !== null ? `${data.stats.winRate.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="text-xs text-muted">Average gain</div>
          <div className="mt-1.5 text-[30px] font-semibold tracking-tight text-pos">{formatPct(data.stats.avgGainPct)}</div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="text-xs text-muted">Average loss</div>
          <div className="mt-1.5 text-[30px] font-semibold tracking-tight text-neg">{formatPct(data.stats.avgLossPct)}</div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="text-xs text-muted">Expectancy</div>
          <div
            className={`mt-1.5 text-[30px] font-semibold tracking-tight ${data.stats.expectancyPct !== null && data.stats.expectancyPct >= 0 ? "text-pos" : "text-neg"}`}
          >
            {formatPct(data.stats.expectancyPct)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="text-xs text-muted">Realised P&amp;L</div>
          <div className={`mt-1.5 text-[30px] font-semibold tracking-tight ${data.stats.realizedPnl >= 0 ? "text-pos" : "text-neg"}`}>
            {formatMoney(market, data.stats.realizedPnl)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="text-xs text-muted">Avg R-multiple</div>
          <div
            className={`mt-1.5 text-[30px] font-semibold tracking-tight ${data.stats.avgRMultiple !== null && data.stats.avgRMultiple >= 0 ? "text-pos" : data.stats.avgRMultiple !== null ? "text-neg" : "text-text"}`}
          >
            {data.stats.avgRMultiple !== null ? `${data.stats.avgRMultiple >= 0 ? "+" : ""}${data.stats.avgRMultiple.toFixed(2)}R` : "—"}
          </div>
        </div>
      </div>

      <PnlCalendar
        market={market}
        trades={data.closedTrades.map((row) => ({
          id: row.trade.id,
          ticker: row.trade.ticker,
          exchange: row.exchange,
          sellDate: row.trade.sell_date as string,
          pnlAbs: row.pnlAbs,
        }))}
        defaultMonth={todayInMarketTimezone(market).slice(0, 7)}
      />

      <div className="flex gap-1.5 border-b border-border" role="tablist">
        <Link
          href={tabSuffix("open")}
          className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 font-semibold ${tab === "open" ? "border-gold text-gold-light" : "border-transparent text-muted hover:text-text"}`}
        >
          Open <Chip variant="neutral">{data.openTrades.length}</Chip>
        </Link>
        <Link
          href={tabSuffix("closed")}
          className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 font-semibold ${tab === "closed" ? "border-gold text-gold-light" : "border-transparent text-muted hover:text-text"}`}
        >
          Closed <Chip variant="neutral">{data.closedTrades.length}</Chip>
        </Link>
      </div>

      {tab === "open" ? (
        <OpenTradesTable rows={data.openTrades} todayIso={new Date().toISOString().slice(0, 10)} />
      ) : (
        <ClosedTradesTable rows={data.closedTrades} />
      )}

      <StrategyResultsTable market={market} results={data.strategyResults} />
    </>
  );
}
