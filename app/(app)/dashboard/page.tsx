import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { OpenTradesCard } from "@/components/dashboard/OpenTradesCard";
import { RegimeCard } from "@/components/dashboard/RegimeCard";
import { TopSectorsCard } from "@/components/dashboard/TopSectorsCard";
import { TriggersCard } from "@/components/dashboard/TriggersCard";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { getDashboardData } from "@/lib/dashboard-data";
import { getOpenTradesWidgetData } from "@/lib/dashboard-open-trades";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await verifySession();
  const { week } = await searchParams;
  const [freshness, data, openTrades] = await Promise.all([
    getFreshnessData(),
    getDashboardData(week),
    getOpenTradesWidgetData(session.userId),
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TriggersCard triggers={data.triggers} />
        <RegimeCard />
      </div>

      <TopSectorsCard sectors={data.topSectors} />

      <OpenTradesCard india={openTrades.india} us={openTrades.us} />
    </>
  );
}
