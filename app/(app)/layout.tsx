import { Sidebar } from "@/components/Sidebar";
import { SyncThemeFromSettings } from "@/components/SyncThemeFromSettings";
import { verifySession } from "@/lib/auth/dal";
import { listMutualFundProfilesEnsuringSelf } from "@/lib/db/mutual-fund-profiles";
import { getAppSettings, getUserSettings } from "@/lib/db/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  const [appSettings, userSettings, mutualFundProfiles] = await Promise.all([
    getAppSettings(),
    getUserSettings(session.userId),
    listMutualFundProfilesEnsuringSelf(session.userId),
  ]);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <SyncThemeFromSettings theme={userSettings.theme} />
      <Sidebar
        siteName={appSettings.site_name}
        email={session.email}
        mutualFundProfiles={mutualFundProfiles}
        longTermHoldingLabel={userSettings.nav_long_term_label}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-clip overflow-y-clip p-4 md:p-7">
        {children}
      </div>
    </div>
  );
}
