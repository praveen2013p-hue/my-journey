import { Suspense } from "react";
import { QuotesManager } from "@/components/settings/QuotesManager";
import { StrategyTagsManager } from "@/components/settings/StrategyTagsManager";
import { UnresolvedSectorSymbols } from "@/components/settings/UnresolvedSectorSymbols";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { isOwnerEmail } from "@/lib/auth/allowed-emails";
import { getAlertHealth } from "@/lib/alert-health";
import { getConstituentCounts } from "@/lib/db/sector-constituents";
import { listAllQuotes } from "@/lib/db/quotes";
import { getZerodhaSession } from "@/lib/db/provider-session";
import { listSectorMap, seedSectorMapIfEmpty } from "@/lib/db/sector-map";
import { getAppSettings, getUserSettings } from "@/lib/db/settings";
import { listStrategyTags } from "@/lib/db/strategy-tags";
import { listUnmappedSymbols } from "@/lib/db/symbol-map";
import { getFreshnessData } from "@/lib/freshness-data";
import { formatIst } from "@/lib/format-ist";
import { SECTOR_MAP_SEED } from "@/lib/sector-map-seed";
import { buildKiteLoginUrl } from "@/lib/zerodha/auth";

interface BackfillResult {
  ok: boolean;
  market?: string;
  sectorsStored?: number;
  weeksStored?: number;
  sectorsUnresolved?: number;
  sectorsNoData?: number;
}

/** Parses the `?backfill=` summary the admin route redirects back with - "error" or "MARKET:sectorsStored:weeksStored:sectorsUnresolved:sectorsNoData". */
function parseBackfillResult(raw: string | undefined): BackfillResult | null {
  if (!raw) return null;
  if (raw === "error") return { ok: false };
  const [market, sectorsStored, weeksStored, sectorsUnresolved, sectorsNoData] = raw.split(":");
  return {
    ok: true,
    market,
    sectorsStored: Number(sectorsStored),
    weeksStored: Number(weeksStored),
    sectorsUnresolved: Number(sectorsUnresolved),
    sectorsNoData: Number(sectorsNoData),
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ zerodha?: string; backfill?: string; resolve?: string; q?: string }>;
}) {
  const session = await verifySession();
  const sp = await searchParams;
  await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
  const [freshness, appSettings, health, unmapped, indiaSectors, constituentCounts, quotes, strategyTags, zerodhaSession, userSettings] =
    await Promise.all([
      getFreshnessData(),
      getAppSettings(),
      getAlertHealth(),
      listUnmappedSymbols(),
      listSectorMap("IN").then((rows) => rows.filter((r) => r.kind === "sector")),
      getConstituentCounts("IN"),
      listAllQuotes(),
      listStrategyTags(session.userId),
      getZerodhaSession(),
      getUserSettings(session.userId),
    ]);

  const kiteConfigured = Boolean(process.env.KITE_API_KEY && process.env.KITE_API_SECRET);
  const isOwner = isOwnerEmail(session.email);
  const backfillResult = parseBackfillResult(sp.backfill);

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
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Personal</h2>
        <form action="/api/settings/birth-year" method="POST" className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="birth_year" className="text-sm text-muted">
            Birth year
          </label>
          <input
            id="birth_year"
            type="number"
            name="birth_year"
            min={1900}
            max={new Date().getUTCFullYear()}
            defaultValue={userSettings.birth_year ?? undefined}
            placeholder="e.g. 1992"
            className="min-h-[44px] w-32 rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 py-2 font-semibold text-bg hover:bg-gold-hover"
          >
            Save
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Not currently used by any feature - Mutual Funds&apos; &ldquo;Safe SWP&rdquo; column now uses the classic
          4% rule instead, which doesn&apos;t need this. Each person signed in sets their own.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Alert health</h2>
        {health.missingThisWeek && (
          <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-neg-border bg-neg-wash px-4 py-3 font-medium text-neg">
            No alert has arrived yet this week (past Saturday 12:00 IST) — check TradingView&apos;s alert list and
            this webhook&apos;s URL/secret.
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

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Sector constituents (India)
        </h2>
        <form
          action="/api/sectors/constituents"
          method="POST"
          encType="multipart/form-data"
          className="flex flex-wrap items-end gap-2.5"
        >
          <input type="hidden" name="market" value="IN" />
          <div>
            <label className="mb-1 block text-xs text-muted" htmlFor="sector-select">
              Sector
            </label>
            <select
              id="sector-select"
              name="sector"
              required
              className="min-h-[44px] rounded-lg border border-border-strong bg-field px-3 text-text"
            >
              {indiaSectors.map((s) => (
                <option key={s.id} value={s.display_name}>
                  {s.display_name} {constituentCounts[s.display_name] ? `(${constituentCounts[s.display_name]})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted" htmlFor="csv-file">
              CSV (one ticker per line)
            </label>
            <input
              id="csv-file"
              type="file"
              name="file"
              accept=".csv,text/csv,text/plain"
              required
              className="min-h-[44px] rounded-lg border border-border-strong bg-field px-3 py-2 text-text file:mr-3 file:rounded-md file:border-0 file:bg-panel-alt file:px-2.5 file:py-1 file:text-text"
            />
          </div>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 py-2 font-semibold text-bg hover:bg-gold-hover"
          >
            Upload
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Replaces that sector&apos;s whole constituent list. Used for the Sectors page&apos;s traded-value column -
          refresh monthly.
        </p>

        <Suspense
          fallback={
            <div className="mt-4 border-t border-border pt-4 text-xs text-muted">Checking sector symbols…</div>
          }
        >
          <UnresolvedSectorSymbols email={session.email} q={sp.q} resolveStatus={sp.resolve} />
        </Suspense>
      </section>

      <QuotesManager quotes={quotes} />

      <StrategyTagsManager tags={strategyTags} />

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Zerodha connection</h2>
        {sp.zerodha === "connected" && (
          <div className="mb-3 rounded-[10px] border border-pos-border bg-pos-wash px-4 py-2.5 text-sm font-medium text-pos">
            Connected. India prices will start using Kite shortly.
          </div>
        )}
        {sp.zerodha === "error" && (
          <div className="mb-3 rounded-[10px] border border-neg-border bg-neg-wash px-4 py-2.5 text-sm font-medium text-neg">
            Couldn&apos;t connect — the Kite login was cancelled or failed. Try again.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              zerodhaSession
                ? "border-pos-border bg-pos-wash text-pos"
                : "border-border-strong bg-chip-neutral text-muted"
            }`}
          >
            {zerodhaSession ? "Connected" : "Not connected"}
          </span>
          {!isOwner ? (
            <span className="text-xs text-muted">Only the account owner can connect Zerodha.</span>
          ) : !kiteConfigured ? (
            <button
              type="button"
              disabled
              title="Needs a Kite Connect API key and secret, and Praveen's ₹500/month plan (BRIEF.md §2) - set KITE_API_KEY and KITE_API_SECRET first."
              className="min-h-[40px] cursor-not-allowed rounded-lg border border-border-strong bg-panel-alt px-3.5 text-sm font-medium text-muted"
            >
              Connect Zerodha
            </button>
          ) : (
            <a
              href={buildKiteLoginUrl()}
              className="flex min-h-[40px] items-center rounded-lg border border-gold bg-gold px-3.5 text-sm font-semibold text-bg hover:bg-gold-hover"
            >
              {zerodhaSession ? "Reconnect Zerodha (10 seconds)" : "Connect Zerodha"}
            </a>
          )}
        </div>
        <p className="mt-2.5 text-xs text-muted">
          India prices use the mock provider until Zerodha is connected. Token expiry:{" "}
          {formatIst(zerodhaSession?.expiresAt ?? null)}. Kite logs out every day, so reconnecting daily is normal,
          not a problem. Reminder: the Kite Connect plan is a paid ₹500/month subscription (BRIEF.md §2) - this app
          never places orders through it, data access only.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">
          2-year sector history backfill
        </h2>
        {backfillResult && !backfillResult.ok && (
          <div className="mb-3 rounded-[10px] border border-neg-border bg-neg-wash px-4 py-2.5 text-sm font-medium text-neg">
            Backfill failed - check the server logs. Safe to try again.
          </div>
        )}
        {backfillResult?.ok && (
          <div className="mb-3 rounded-[10px] border border-pos-border bg-pos-wash px-4 py-2.5 text-sm text-pos">
            <span className="font-medium">
              {backfillResult.market}: backfilled {backfillResult.sectorsStored} sector
              {backfillResult.sectorsStored === 1 ? "" : "s"}, {backfillResult.weeksStored} weeks total.
            </span>
            {Boolean(backfillResult.sectorsUnresolved) && (
              <> {backfillResult.sectorsUnresolved} sector(s) have no resolved symbol yet (see below).</>
            )}
            {Boolean(backfillResult.sectorsNoData) && (
              <> {backfillResult.sectorsNoData} sector(s) returned no price data - try again later.</>
            )}
          </div>
        )}
        <p className="mb-3 text-xs text-muted">
          Fetches 2 years of weekly index history (plus a 52-week warm-up for Mansfield RS) from Kite/Yahoo for
          every sector with a resolved index symbol, and stores it as source=&quot;backfill&quot; so Δ4/Δ13/Δ26/Δ52
          trend numbers have real history before your TradingView alerts have been running that long
          (BRIEF.md §7.2). Never overwrites a week that already came from a real alert. Safe to re-run any time.
        </p>
        {!isOwner ? (
          <span className="text-xs text-muted">Only the account owner can run the backfill.</span>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            <form action="/api/admin/sector-backfill" method="POST">
              <input type="hidden" name="market" value="IN" />
              <button
                type="submit"
                className="min-h-[40px] rounded-lg border border-gold bg-gold px-3.5 text-sm font-semibold text-bg hover:bg-gold-hover"
              >
                Backfill India sectors
              </button>
            </form>
            <form action="/api/admin/sector-backfill" method="POST">
              <input type="hidden" name="market" value="US" />
              <button
                type="submit"
                className="min-h-[40px] rounded-lg border border-gold bg-gold px-3.5 text-sm font-semibold text-bg hover:bg-gold-hover"
              >
                Backfill US sectors
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Data downloads</h2>
        <div className="flex flex-col gap-2.5">
          {[
            { key: "alerts", label: "Alerts" },
            { key: "trades", label: "My trades" },
            { key: "sector-snapshots", label: "Sector snapshots" },
          ].map((d) => (
            <div key={d.key} className="flex flex-wrap items-center gap-2.5">
              <span className="w-36 font-medium">{d.label}</span>
              <a
                href={`/api/export/${d.key}?format=csv`}
                className="rounded-lg border border-border-strong bg-panel-alt px-3 py-1.5 text-sm font-medium hover:bg-panel"
              >
                Download CSV
              </a>
              <a
                href={`/api/export/${d.key}?format=xlsx`}
                className="rounded-lg border border-border-strong bg-panel-alt px-3 py-1.5 text-sm font-medium hover:bg-panel"
              >
                Download Excel
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Backup status</h2>
        <p className="text-sm text-muted">
          No nightly backup is running yet - that needs a Vercel Cron job, which isn&apos;t set up on this
          deployment yet (BRIEF.md §11). Use the data downloads above any time in the meantime; they always reflect
          everything currently stored.
        </p>
      </section>
    </>
  );
}
