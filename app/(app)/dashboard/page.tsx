import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { MarketSnapshotCard } from "@/components/dashboard/MarketSnapshotCard";
import { RegimeCard } from "@/components/dashboard/RegimeCard";
import { RiskScoreCard } from "@/components/dashboard/RiskScoreCard";
import { TopSectorsCard } from "@/components/dashboard/TopSectorsCard";
import { TriggersCard } from "@/components/dashboard/TriggersCard";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { getDashboardData } from "@/lib/dashboard-data";
import { getDistributionDayCount } from "@/lib/distribution-days";
import { getFreshnessData } from "@/lib/freshness-data";
import { getMarketSnapshot } from "@/lib/market-snapshot";
import { getRiskScore } from "@/lib/risk-score";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await verifySession();
  const { week } = await searchParams;
  const [freshness, data, indiaSnapshot, usSnapshot, indiaDistDays, usDistDays, indiaRisk, usRisk] =
    await Promise.all([
      getFreshnessData(),
      getDashboardData(week),
      getMarketSnapshot("IN"),
      getMarketSnapshot("US"),
      getDistributionDayCount("IN"),
      getDistributionDayCount("US"),
      getRiskScore("IN"),
      getRiskScore("US"),
    ]);

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader
        title="Dashboard"
        subtitle={`Week ending ${data.weekEnding ?? "— none yet"}`}
        actions={
          <>
            <Link
              href={`/dashboard?week=${data.prevWeek}`}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
            >
              <ChevronLeftIcon /> Prev week
            </Link>
            <Link
              href={`/dashboard?week=${data.nextWeek}`}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
            >
              Next week <ChevronRightIcon />
            </Link>
          </>
        }
      />

      <MarketSnapshotCard
        india={indiaSnapshot}
        us={usSnapshot}
        indiaDistributionDays={indiaDistDays.count}
        usDistributionDays={usDistDays.count}
      />

      <RiskScoreCard india={indiaRisk} us={usRisk} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TriggersCard triggers={data.triggers} weekEnding={data.weekEnding} />
        <RegimeCard />
      </div>

      <TopSectorsCard sectors={data.topSectors} />
    </>
  );
}
