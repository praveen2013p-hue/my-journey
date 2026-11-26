import { PageHeader } from "@/components/PageHeader";
import { NetWorthDashboard } from "@/components/net-worth/NetWorthDashboard";
import { verifySession } from "@/lib/auth/dal";
import { listMutualFundProfiles } from "@/lib/db/mutual-fund-profiles";
import { listMutualFundEntries } from "@/lib/db/mutual-funds";
import { listNpsEntries } from "@/lib/db/nps";
import { computeNetWorthView, type NetWorthEntity } from "@/lib/net-worth-stats";
import { buildMutualFundView } from "@/lib/mutual-fund-stats";
import { buildNpsView } from "@/lib/nps-stats";

/**
 * Read-only consolidated view across every Mutual Fund profile (every
 * family member) + NPS (DECISIONS.md) - pure aggregation of data these
 * trackers already have, no new entry forms, no new tables.
 */
export default async function NetWorthPage() {
  const session = await verifySession();

  const profiles = await listMutualFundProfiles(session.userId);
  const [mfEntriesByProfile, npsEntries] = await Promise.all([
    Promise.all(profiles.map((profile) => listMutualFundEntries(session.userId, profile.id))),
    listNpsEntries(session.userId),
  ]);

  const entities: NetWorthEntity[] = profiles.map((profile, i) => {
    const { dashboard, rows } = buildMutualFundView(mfEntriesByProfile[i]);
    return { name: profile.name, kind: "mutual_fund", dashboard, rows };
  });

  const npsView = buildNpsView(npsEntries);
  entities.push({ name: "NPS", kind: "nps", dashboard: npsView.dashboard, rows: npsView.rows });

  const view = computeNetWorthView(entities);

  return (
    <>
      <PageHeader title="Net Worth" subtitle="Every Mutual Fund profile + NPS, combined" />
      <NetWorthDashboard view={view} />
    </>
  );
}
