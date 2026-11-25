import { AddEntryModal } from "@/components/mutual-funds/AddEntryModal";
import { MutualFundDashboard } from "@/components/mutual-funds/MutualFundDashboard";
import { YearSection } from "@/components/mutual-funds/YearSection";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { listMutualFundEntries } from "@/lib/db/mutual-funds";
import { buildMutualFundView } from "@/lib/mutual-fund-stats";

export default async function MutualFundsPage() {
  const session = await verifySession();
  const entries = await listMutualFundEntries(session.userId);
  const { dashboard, byYear } = buildMutualFundView(entries);

  return (
    <>
      <PageHeader
        title="Mutual Funds"
        subtitle="Your own manual monthly tracker - replaces the spreadsheet"
        actions={<AddEntryModal />}
      />

      <MutualFundDashboard dashboard={dashboard} />

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
