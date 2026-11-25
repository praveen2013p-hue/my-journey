import { AddEntryModal } from "@/components/nps/AddEntryModal";
import { NpsDashboard } from "@/components/nps/NpsDashboard";
import { YearGroupsView } from "@/components/nps/YearGroupsView";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { listNpsEntries } from "@/lib/db/nps";
import { buildNpsView } from "@/lib/nps-stats";

export default async function NpsPage() {
  const session = await verifySession();
  const entries = await listNpsEntries(session.userId);
  const { dashboard, byYear, rows } = buildNpsView(entries);

  return (
    <>
      <PageHeader
        title="NPS"
        subtitle="Your NPS portfolio, tracked month by month"
        actions={<AddEntryModal />}
      />

      <NpsDashboard dashboard={dashboard} rows={rows} />

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
