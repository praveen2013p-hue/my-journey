import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader, PhaseStub } from "@/components/PageHeader";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function JournalPage() {
  const freshness = await getFreshnessData();

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader title="Journal" subtitle="Your own trades · separate from your wife's journal" />
      <PhaseStub
        title="Journal page"
        phase={3}
        note="Trade logging, strategy tags, win-rate/expectancy cards and per-strategy results (BRIEF.md §7.4) ship in Phase 3, alongside Performance and Weekly Review."
      />
    </>
  );
}
