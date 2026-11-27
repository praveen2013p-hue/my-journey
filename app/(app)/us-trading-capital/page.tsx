import { AddEntryModal } from "@/components/us-trading-capital/AddEntryModal";
import { USTradingCapitalDashboard } from "@/components/us-trading-capital/USTradingCapitalDashboard";
import { YearSection } from "@/components/us-trading-capital/YearSection";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { listUsTradingCapitalEntries } from "@/lib/db/us-trading-capital";
import { buildUsTradingCapitalView } from "@/lib/us-trading-capital-stats";

export default async function UsTradingCapitalPage() {
  const session = await verifySession();
  const entries = await listUsTradingCapitalEntries(session.userId);
  const { dashboard, byYear, rows } = buildUsTradingCapitalView(entries);

  return (
    <>
      <PageHeader
        title="US Trading Capital"
        subtitle="Capital deposited into your US swing-trading account, tracked month by month"
        actions={<AddEntryModal />}
      />

      <USTradingCapitalDashboard dashboard={dashboard} rows={rows} />

      {byYear.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
          No entries yet. Click &ldquo;+ Add entry&rdquo; to log your first month.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {byYear.map((group, i) => (
            <YearSection key={group.year} group={group} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </>
  );
}
