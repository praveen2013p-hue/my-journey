import Link from "next/link";
import { AddEntryModal } from "@/components/mutual-funds/AddEntryModal";
import { MutualFundDashboard } from "@/components/mutual-funds/MutualFundDashboard";
import { YearSection } from "@/components/mutual-funds/YearSection";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { listMutualFundEntries } from "@/lib/db/mutual-funds";
import { getUserSettings } from "@/lib/db/settings";
import { buildMutualFundView } from "@/lib/mutual-fund-stats";

export default async function MutualFundsPage() {
  const session = await verifySession();
  const [entries, userSettings] = await Promise.all([
    listMutualFundEntries(session.userId),
    getUserSettings(session.userId),
  ]);
  const { dashboard, byYear } = buildMutualFundView(entries, userSettings.birth_year);

  return (
    <>
      <PageHeader
        title="Mutual Funds"
        subtitle="Your own manual monthly tracker - replaces the spreadsheet"
        actions={<AddEntryModal />}
      />

      {userSettings.birth_year === null && (
        <div className="rounded-xl border border-warn-border bg-warn-wash px-4 py-3 text-sm text-warn">
          Set your birth year in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          to see the &ldquo;Safe SWP&rdquo; column below.
        </div>
      )}

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
