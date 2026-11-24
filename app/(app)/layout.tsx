import { RegimeBannerClient } from "@/components/RegimeBanner";
import { Sidebar } from "@/components/Sidebar";
import { verifySession } from "@/lib/auth/dal";
import { getAppSettings, getUserSettings } from "@/lib/db/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  // Note: no market-regime fetch here on purpose - it needs a real Yahoo
  // Finance call, and awaiting that in the shared layout used to block
  // EVERY page's render on it. The regime light/banner now fetch it
  // themselves, client-side, after the page has already painted
  // (lib/use-regime.ts) - see DECISIONS.md.
  const [appSettings, userSettings] = await Promise.all([
    getAppSettings(),
    getUserSettings(session.userId),
  ]);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <SyncThemeFromSettings theme={userSettings.theme} />
      <Sidebar siteName={appSettings.site_name} email={session.email} />
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-hidden p-4 md:p-7">
        <RegimeBannerClient />
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
