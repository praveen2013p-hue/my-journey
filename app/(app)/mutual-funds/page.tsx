import { AddEntryModal } from "@/components/mutual-funds/AddEntryModal";
import { MutualFundDashboard } from "@/components/mutual-funds/MutualFundDashboard";
import { YearGroupsView } from "@/components/mutual-funds/YearGroupsView";
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
        subtitle="Aiming for 50 Crore Mutual Fund Portfolio"
        actions={<AddEntryModal />}
      />

      <MutualFundDashboard dashboard={dashboard} />

      {byYear.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
          No entries yet. Click &ldquo;+ Add entry&rdquo; to log your first month.
        </div>
      ) : (
        <YearGroupsView groups={byYear} />
      )}
    </>
  );
}
