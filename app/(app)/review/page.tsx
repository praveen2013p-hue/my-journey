import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader, PhaseStub } from "@/components/PageHeader";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function WeeklyReviewPage() {
  const freshness = await getFreshnessData();

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader title="Weekly Review" />
      <PhaseStub
        title="Weekly Review page"
        phase={3}
        note="Auto-generated per-week summary plus your reflections box (BRIEF.md §7.5) ships in Phase 3."
      />
    </>
  );
}
