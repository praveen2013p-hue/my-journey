import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader, PhaseStub } from "@/components/PageHeader";
import { getFreshnessData } from "@/lib/freshness-data";

export default async function SectorsPage() {
  const freshness = await getFreshnessData();

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader title="Sectors" subtitle="Where money is flowing and where relative strength is improving" />
      <PhaseStub
        title="Sectors page"
        phase={2}
        note="The ranked sector table, RS deltas, traded-value ratio, 1W columns and focus star (BRIEF.md §7.2, §16) need the 2-year backfill and sector_metrics engine, built next."
      />
    </>
  );
}
