import { BreakoutsTable } from "@/components/breakouts/BreakoutsTable";
import { FilterBar } from "@/components/breakouts/FilterBar";
import { BreakoutsTabs } from "@/components/breakouts/Tabs";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { getBreakoutsPageData, type BreakoutsFilters } from "@/lib/breakouts-data";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function BreakoutsPage({
  searchParams,
}: {
  searchParams: Promise<BreakoutsFilters>;
}) {
  const session = await verifySession();
  const sp = await searchParams;
  const [freshness, data] = await Promise.all([
    getFreshnessData(),
    getBreakoutsPageData(session.userId, "breakout", sp),
  ]);

  const queryString = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString();

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader title="Breakouts" />
      <BreakoutsTabs active="breakout" tabCounts={data.tabCounts} queryString={queryString} />
      {data.newSinceLastVisit > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-gold-border bg-gold-wash px-4 py-3 font-medium text-gold-light">
          <span>{data.newSinceLastVisit} new stocks since your last visit</span>
          <span className="text-sm font-normal">New badges clear after you view the list</span>
        </div>
      )}
      <FilterBar
        weekEnding={data.weekEnding}
        prevWeek={data.prevWeek}
        nextWeek={data.nextWeek}
        rangeMode={data.rangeMode}
        dateFrom={data.dateFrom}
        dateTo={data.dateTo}
        market={data.market}
        grades={data.grades}
        sector={data.sector}
        industry={data.industry}
        search={data.search}
        availableSectors={data.availableSectors}
        availableIndustries={data.availableIndustries}
      />
      <BreakoutsTable rows={data.rows} signalType="breakout" />
    </>
  );
}
