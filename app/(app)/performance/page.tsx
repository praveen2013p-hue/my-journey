import { HoldVsSoldTable } from "@/components/performance/HoldVsSoldTable";
import { ShortlistTable } from "@/components/performance/ShortlistTable";
import { StatsCards } from "@/components/performance/StatsCards";
import { TimeFrameBar } from "@/components/performance/TimeFrameBar";
import { StrategyResultsTable } from "@/components/journal/StrategyResultsTable";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { listTrades } from "@/lib/db/trades";
import { listStrategyTags } from "@/lib/db/strategy-tags";
import type { Market } from "@/lib/db/schema-types";
import { getFreshnessData } from "@/lib/freshness-data";
import {
  getHoldVsSoldData,
  getShortlistPerformanceData,
  resolveTimeFrame,
} from "@/lib/performance-data";
import { closedTradePnl, computeStrategyResults, computeTradeStats } from "@/lib/trade-stats";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; preset?: string; from?: string; to?: string }>;
}) {
  const session = await verifySession();
  const sp = await searchParams;
  const market: Market = sp.market === "US" ? "US" : "IN";
  const timeFrame = resolveTimeFrame(sp.preset, sp.from, sp.to);

  const [freshness, trades, tags, holdVsSold, shortlist] = await Promise.all([
    getFreshnessData(),
    listTrades(session.userId, market),
    listStrategyTags(session.userId),
    getHoldVsSoldData(session.userId, market, timeFrame),
    getShortlistPerformanceData(session.userId, market, timeFrame),
  ]);

  const closedInRange = trades
    .filter((t) => t.sell_date && (!timeFrame.fromDate || t.sell_date >= timeFrame.fromDate) && t.sell_date <= timeFrame.toDate)
    .map((t) => closedTradePnl(t))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const stats = computeTradeStats(closedInRange);
  const tagNamesById = new Map(tags.map((t) => [t.id, t.name]));
  const strategyResults = computeStrategyResults(closedInRange, tagNamesById);

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader
        title="Performance"
        subtitle={
          timeFrame.fromDate
            ? `${timeFrame.fromDate} – ${timeFrame.toDate}`
            : `All time, up to ${timeFrame.toDate}`
        }
      />

      <TimeFrameBar market={market} preset={timeFrame.preset} customFrom={sp.from ?? null} customTo={sp.to ?? null} />

      <StatsCards market={market} stats={stats} />

      <StrategyResultsTable market={market} results={strategyResults} />

      <HoldVsSoldTable market={market} data={holdVsSold} />

      <ShortlistTable market={market} data={shortlist} />
    </>
  );
}
