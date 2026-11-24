import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader, PhaseStub } from "@/components/PageHeader";
import { getAlertHealth } from "@/lib/alert-health";
import { getAppSettings } from "@/lib/db/settings";
import { listUnmappedSymbols } from "@/lib/db/symbol-map";
import { getFreshnessData } from "@/lib/freshness-data";
import { formatIst } from "@/lib/format-ist";

export default async function SettingsPage() {
  const [freshness, appSettings, health, unmapped] = await Promise.all([
    getFreshnessData(),
    getAppSettings(),
    getAlertHealth(),
    listUnmappedSymbols(),
  ]);

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader title="Settings" />

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Site name</h2>
        <form action="/api/settings/site-name" method="POST" className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            name="site_name"
            defaultValue={appSettings.site_name}
            maxLength={60}
            className="min-h-[44px] w-64 rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 py-2 font-semibold text-bg hover:bg-gold-hover"
          >
            Save
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">Shown in the sidebar, the browser tab title, and on the login page.</p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Alert health</h2>
        {health.missingThisWeek && (
          <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-neg-border bg-neg-wash px-4 py-3 font-medium text-neg">
            No alert has arrived yet this week (past Saturday 12:00 IST) — check TradingView's alert list and this
            webhook's URL/secret.
          </div>
        )}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">This week</dt>
            <dd className="text-base font-semibold">{health.acceptedThisWeek}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Previous week</dt>
            <dd className="text-base font-semibold">{health.acceptedLastWeek}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Rejected (this week)</dt>
            <dd className="text-base font-semibold text-neg">{health.rejectedThisWeek}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last alert</dt>
            <dd className="text-base font-semibold">{formatIst(health.lastAlertAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Unmapped symbols ({unmapped.length})
        </h2>
        {unmapped.length === 0 ? (
          <p className="text-sm text-muted">Nothing unmapped — every ticker seen so far has a provider symbol.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {unmapped.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5">
                <span className="rounded-full border border-border-strong bg-chip-neutral px-2.5 py-0.5 text-xs font-semibold text-muted">
                  {s.market}
                </span>
                <span className="font-medium">{s.tv_ticker}</span>
                <span className="text-xs text-muted">({s.exchange}) — price unavailable until mapped</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Editing a mapping (Kite/Yahoo symbol) is coming with the live-provider wiring.
        </p>
      </section>

      <PhaseStub
        title="Remaining Settings sections"
        phase={3}
        note="Quotes manager, strategy tags, Zerodha connection, data downloads and backup status (BRIEF.md §7.6) ship in Phase 3."
      />
    </>
  );
}
