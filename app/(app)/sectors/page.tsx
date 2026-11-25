import Link from "next/link";
import { SectorsTable } from "@/components/sectors/SectorsTable";
import { RotationHeatmap } from "@/components/sectors/RotationHeatmap";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { seedSectorMapIfEmpty } from "@/lib/db/sector-map";
import { getFreshnessData } from "@/lib/freshness-data";
import { SECTOR_MAP_SEED } from "@/lib/sector-map-seed";
import { getSectorRotationMatrix } from "@/lib/sector-rotation";
import { getSectorsPageData } from "@/lib/sectors-page-data";
import type { Market } from "@/lib/db/schema-types";

export default async function SectorsPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  const { market: marketParam } = await searchParams;
  const market: Market = marketParam === "US" ? "US" : "IN";

  await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
  const [freshness, data, rotation] = await Promise.all([
    getFreshnessData(),
    getSectorsPageData(market),
    getSectorRotationMatrix(market),
  ]);

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader
        title="Sectors"
        subtitle="Where money is flowing and where relative strength is improving · benchmark Nifty 500 / S&P 500"
      />

      <div className="flex gap-2">
        <Link
          href="/sectors?market=IN"
          className={`rounded-full border px-3.5 py-1.5 font-medium ${market === "IN" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
        >
          India
        </Link>
        <Link
          href="/sectors?market=US"
          className={`rounded-full border px-3.5 py-1.5 font-medium ${market === "US" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
        >
          US
        </Link>
      </div>

      {data.weekEnding === null ? (
        <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
          No sector snapshot received yet for {market === "IN" ? "India" : "the US"}. Once your TradingView sector
          board alert fires, this page fills in automatically.
        </div>
      ) : (
        <>
          <div className="text-xs text-muted">Week ending {data.weekEnding}</div>
          <SectorsTable rows={data.rows} showKindToggle={market === "US"} market={market} />
        </>
      )}

      <div className="text-xs text-muted">
        1W columns compare this week with last week: price change of the sector index, change in Mansfield RS
        points, change in traded value vs last week, and how many places the sector moved in the ranking. RS history
        is built from your weekly sector snapshots plus any backfill.
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Sector rotation</h2>
        <p className="mb-3 text-xs text-muted">
          Each sector&apos;s RS rank by week (1 = strongest that week) - where money has been rotating, not just
          this week&apos;s snapshot. Sectors only (not industries).
        </p>
        <RotationHeatmap matrix={rotation} />
      </div>
    </>
  );
}
