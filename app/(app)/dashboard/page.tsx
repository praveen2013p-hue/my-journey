import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { RegimeCard } from "@/components/dashboard/RegimeCard";
import { TopSectorsCard } from "@/components/dashboard/TopSectorsCard";
import { TriggersCard } from "@/components/dashboard/TriggersCard";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader, PhaseStub } from "@/components/PageHeader";
import { getDashboardData } from "@/lib/dashboard-data";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const [freshness, data] = await Promise.all([
    getFreshnessData(),
    getDashboardData(week),
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

      <PhaseStub
        title="Open trades and P&L widget"
        phase={3}
        note="Needs the trades table and Journal (BRIEF.md §7.3 widget 4), which ship together in Phase 3."
      />
    </>
  );
}
