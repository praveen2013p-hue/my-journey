import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader, PhaseStub } from "@/components/PageHeader";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function DashboardPage() {
  const freshness = await getFreshnessData();

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader title="Dashboard" subtitle="Week ending — none yet" />
      <PhaseStub
        title="Dashboard widgets"
        phase={2}
        note="This week's triggers, market regime light, top sectors and open trades/P&L land with the Sectors and Journal work (BRIEF.md §7.3, §12)."
      />
    </>
  );
}
