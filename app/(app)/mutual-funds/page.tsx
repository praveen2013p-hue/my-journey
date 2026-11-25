import { AddEntryModal } from "@/components/mutual-funds/AddEntryModal";
import { MutualFundDashboard } from "@/components/mutual-funds/MutualFundDashboard";
import { YearGroupsView } from "@/components/mutual-funds/YearGroupsView";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { ensureSelfProfile, getMutualFundProfileById, listMutualFundProfiles } from "@/lib/db/mutual-fund-profiles";
import { listMutualFundEntries } from "@/lib/db/mutual-funds";
import { buildMutualFundView } from "@/lib/mutual-fund-stats";

export default async function MutualFundsPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const session = await verifySession();
  const { profile: profileIdParam } = await searchParams;

  // No ?profile= yet (first visit, or a bookmark from before profiles
  // existed) - fall back to the user's "Self" profile, creating it if
  // this is their very first time here at all.
  const profile = profileIdParam
    ? await getMutualFundProfileById(session.userId, profileIdParam)
    : null;
  const activeProfile = profile ?? (await ensureSelfProfile(session.userId));

  const [entries, allProfiles] = await Promise.all([
    listMutualFundEntries(session.userId, activeProfile.id),
    listMutualFundProfiles(session.userId),
  ]);
  const { dashboard, byYear, rows } = buildMutualFundView(entries);

  return (
    <>
      <PageHeader
        title="Mutual Funds"
        subtitle={
          allProfiles.length > 1
            ? `${activeProfile.name} - Aiming for 50 Crore Mutual Fund Portfolio`
            : "Aiming for 50 Crore Mutual Fund Portfolio"
        }
        actions={<AddEntryModal profileId={activeProfile.id} />}
      />

      <MutualFundDashboard dashboard={dashboard} rows={rows} />

      {byYear.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
          No entries yet for {activeProfile.name}. Click &ldquo;+ Add entry&rdquo; to log the first month.
        </div>
      ) : (
        <YearGroupsView groups={byYear} />
      )}
    </>
  );
}
