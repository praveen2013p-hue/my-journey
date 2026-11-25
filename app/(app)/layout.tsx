import { Sidebar } from "@/components/Sidebar";
import { SyncThemeFromSettings } from "@/components/SyncThemeFromSettings";
import { verifySession } from "@/lib/auth/dal";
import { getAppSettings, getUserSettings } from "@/lib/db/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  const [appSettings, userSettings] = await Promise.all([
    getAppSettings(),
    getUserSettings(session.userId),
  ]);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <SyncThemeFromSettings theme={userSettings.theme} />
      <Sidebar siteName={appSettings.site_name} email={session.email} />
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-hidden p-4 md:p-7">
        {children}
      </div>
    </div>
  );
}
