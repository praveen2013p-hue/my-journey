import { RegimeBanner } from "@/components/RegimeBanner";
import { Sidebar } from "@/components/Sidebar";
import { verifySession } from "@/lib/auth/dal";
import { getAppSettings, getUserSettings } from "@/lib/db/settings";
import { getBothMarketRegimes } from "@/lib/regime";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  const [appSettings, userSettings, { india, us }] = await Promise.all([
    getAppSettings(),
    getUserSettings(session.userId),
    getBothMarketRegimes(),
  ]);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <SyncThemeFromSettings theme={userSettings.theme} />
      <Sidebar
        siteName={appSettings.site_name}
        email={session.email}
        regime={{ india: india.stage, us: us.stage }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-hidden p-4 md:p-7">
        <RegimeBanner india={india} us={us} />
        {children}
      </div>
    </div>
  );
}

/** Reconciles <html data-theme> with the signed-in user's saved preference (lib/db/settings.ts). */
function SyncThemeFromSettings({ theme }: { theme: "dark" | "light" }) {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `(function(){try{document.documentElement.setAttribute('data-theme','${theme}');document.cookie='mj_theme=${theme}; path=/; max-age=31536000; samesite=lax';}catch(e){}})();`,
      }}
    />
  );
}
