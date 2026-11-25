# Decisions

Every choice this file records is one BRIEF.md didn't settle. Safest default
picked, noted here, then kept moving — per BRIEF.md's own instruction not to
stop and ask for these.

## Infra / environment

- **Supabase project connected** (as of this entry). Until now, the app ran
  against a local JSON-file store (`lib/db/local-store.ts`) that mirrors the
  exact table/column shapes in `supabase/migrations/0001_init.sql`. Every
  repository function in `lib/db/*` checks `isSupabaseConfigured()` and
  calls the real Postgres query when Supabase env vars are present,
  otherwise falls back to the local store — so wiring in the real project
  was flipping env vars, not a rewrite. The local store still exists and is
  still what runs with no Supabase configured (e.g. a fresh clone, or local
  dev with an empty `.env.local`): it lives under the OS temp directory
  (`os.tmpdir()`), not the project folder, since a Vercel deployment's
  bundle is read-only and `/tmp` is the only writable path a serverless
  function gets — and `/tmp` is wiped on every cold start and isn't shared
  between concurrent instances, so without Supabase two people (or two
  requests) could see different data. None of that applies now that
  Supabase is connected.
- **Mock-session `userId` resolves to a real Supabase Auth user, not the
  raw email** (`lib/auth/supabase-user-id.ts`), once Supabase is
  configured. Every per-user table (`trades`, `strategy_tags`,
  `user_settings`, `stock_notes`, `weekly_reflections`) has
  `user_id uuid references auth.users (id)` — a real foreign key — so
  inserting the email string as `user_id` would fail outright. Instead,
  the first time each allow-listed email is seen, the service-role admin
  API looks it up (or lazily creates it, `email_confirm: true`, no
  password) in `auth.users` and uses that row's real id from then on. This
  keeps "pick your account" working exactly as before while making every
  per-user table Supabase-compatible immediately, without waiting on full
  Google OAuth. When real Google sign-in is wired up later, signing in
  with the same email is expected to link to this same row (Supabase
  matches existing users by email by default) — worth re-confirming at
  that point, not assumed here.
- **Cache Components (Next.js 16's new default caching model) is turned
  off** (`next.config.ts`). This is a small, always-dynamic, two-user app
  (live prices, per-user auth) — the simpler "nothing cached unless you
  opt in" model is safer than the new prerendering-by-default one for a
  private dashboard with no public, cacheable pages.
- **Test runner: Vitest**, not Jest — faster, zero-config TypeScript/ESM
  support, nothing in BRIEF.md specified one.
- **Local dev persistence: a single JSON file**, not SQLite. Avoids a
  native-binary dependency (`better-sqlite3`) that may not install cleanly
  in every environment. Fine for a 2-user dev store; irrelevant once
  Supabase is wired in.

## Schema

- **Added `app_settings`** (single global row: `site_name`, default sector
  RS benchmarks per market) — not explicitly listed in BRIEF.md §4, but §2
  says the site name is "global," while `user_settings` is per-user
  (RLS `user_id = auth.uid()`). A genuinely global value can't live in a
  per-user table, so it gets its own one-row table. `user_settings` keeps
  theme, timezone, and `last_seen_alerts_at`.
- **Mock auth for Phase 1** (`lib/auth/mock.ts`): a signed cookie holding
  one of the two allow-listed emails, standing in for real Google OAuth
  until Supabase + Google OAuth credentials exist. The allow-list check
  (`ALLOWED_EMAILS` env var) runs the same way it will for real auth, so
  swapping in Supabase Google sign-in later changes only how the cookie
  gets set, not how the rest of the app reads "who is logged in."

## Breakouts/Pullbacks page and mock data

- **Mock live prices are not anchored to each alert's trigger price.**
  `lib/providers/mock.ts` derives a price purely from a hash of the
  provider symbol (so it's stable and drifts slowly), with no notion of
  "this ticker's trigger was ₹566." Demoing with the India mock, "%  since
  trigger" and the "Extended >20%" flag will look exaggerated (e.g.
  KALYANKJIL showing +248%). This is cosmetic to this mock-only demo
  session, not a real bug — Kite will supply real India prices once
  connected, and the same code path (live price vs. stored trigger price)
  is unit-tested against realistic numbers in `lib/breakouts-data.test.ts`.
  Anchoring the mock to each trigger price was considered and rejected: it
  would mean threading alert data into a provider interface that must stay
  symbol-in/price-out for Kite and Yahoo too.
- **US quotes may show "unavailable" in this sandboxed dev environment.**
  The Yahoo provider is real (not mocked), and this container's outbound
  network is restricted, so `yahoo-finance2` calls typically fail here —
  the page handles that exactly as BRIEF.md §17.5 asks (no crash, no
  quote shown, nothing retried in a tight loop). On Vercel, with normal
  outbound network access, US quotes work. Set `FORCE_MOCK_US=true` to
  demo entirely offline instead.
- **Column chooser and CSV/Excel export are not built in Phase 1.**
  BRIEF.md §7.1 lists them, but neither is in the Phase 1 "Done when"
  checklist (§12), and CSV/Excel export is explicitly a Settings → Phase 3
  item (§7.6). Sorting and the sticky header (the parts that matter most
  for actually using the table) are built. Revisit column-choosing if it
  turns out to be missed.
- **Sector context in the side panel is a placeholder until Phase 2.**
  It shows the alert's own `sector`/`industry` text (real, from the
  webhook payload) but not each sector's Stage/RS/focus-star, since that
  needs the `sector_constituents` mapping and `sector_metrics` engine,
  both Phase 2 work (BRIEF.md §7.2, §12).

## Phase 2

- **The sector-board payload's own `focus` field is never trusted
  directly.** BRIEF.md §7.2 gives the app its own focus rule (Stage 2 +
  RS > 0 + Δ4 > 0 + Δ13 > 0) and says to make it "a small configurable
  function" - so `lib/sector-metrics.ts` always recomputes `is_focus`
  from what's actually stored, even when the payload says `focus: true`.
  With only one week of history, Δ13 is unknowable, so a sector that the
  Pine script marks focus can still show as "Stage 2 + RS > 0" (10
  points) rather than "focus" (15) in the Quality Score until enough
  weekly snapshots exist - confirmed in
  `lib/webhook/process.test.ts`.
- **Quality Score's sector-strength bucket needs an explicit
  `sector_constituents` upload** (ticker -> one of the 28 tracked India
  sectors / US sectors+industries) - it never infers this from the
  alert's own free-text `sector`/`industry` fields, since those are
  TradingView's own categories and don't reliably match the tracked
  index names. Until Praveen uploads a sector's constituents, every
  stock in it scores 0/missing for that bucket - correct and honest, not
  a bug.
- **Quality Score is recomputed per affected week whenever a sector-board
  snapshot arrives** (`recomputeQualityForWeek`, BRIEF.md §9), not on a
  schedule - the only thing that can change is the sector-strength
  bucket, so re-running it on every relevant webhook hit is cheap and
  always current.
- **India's sector-index 1W price change stays "—" for 24 of 28
  sectors.** Same honesty principle as symbol mapping: BRIEF.md §5c gives
  confirmed TradingView symbols for only 4 India sectors (Bank, PSU Bank,
  IT, Defence); the rest need a live Kite instruments-dump lookup this
  app doesn't have yet. Their Stage/RS (from the webhook) work fine
  regardless - only the index's own weekly price change is affected.

## Performance (found after deploying to Vercel)

- **The market regime fetch (India + US Weinstein stage) no longer blocks
  any page's server render.** It used to be awaited in the shared
  `(app)/layout.tsx`, so every single page - Dashboard, Breakouts,
  Settings, all of them - waited on a real Yahoo Finance network call
  before responding. On Vercel's serverless functions, which get recycled
  constantly, the in-memory 1-hour cache almost never got to help, so
  this was effectively a live Yahoo round-trip on every page view -
  confirmed by timing requests before/after (warm pages went from
  blocking on an external call to under 250ms locally). Fixed by moving
  it to `/api/regime` + `lib/use-regime.ts`, fetched client-side after
  the page has already painted; the Sidebar dots and the red banner
  briefly show "—" and fill in a moment later instead of holding up
  everything behind them.
- **The Sectors page no longer always recomputes sector_metrics.** It
  used to call `computeAndStoreSectorMetrics` unconditionally on every
  view, which (for US) makes a Yahoo call per sector/industry for the 1W
  price and the traded-value engine - up to ~30 external calls on one
  page load. The webhook already recomputes this the moment a
  sector-board snapshot arrives, so the page now only recomputes as a
  fallback when nothing has been computed yet for that week.

## Phase 3 - Performance page

- **No real nightly cron for `price_history` backfill.** BRIEF.md §15
  says daily closes are "updated by the nightly job," but this app has no
  Vercel Cron set up yet (nightly backup, weekly sector refresh, and this
  are all cron items BRIEF mentions that don't exist - a bigger, separate
  piece of infra than the Performance page itself). Instead,
  `lib/price-history-backfill.ts` fetches and stores a ticker's daily
  closes **on demand**, the first time the Performance page needs them for
  a date range, and skips re-fetching once the most recent trading day is
  already stored - so a real cron can be added later purely as "call this
  same function for every tracked ticker on a schedule" without changing
  how the page reads the data.
- **"Max gain/drawdown since trigger" is close-to-close, not
  intraday.** `price_history` only stores daily closes (BRIEF.md's own
  schema), so these are the best/worst *closing* prices since the trigger
  week, not the literal intraday high/low. With the India mock provider,
  this can look unintuitive in a demo: the mock's daily-history series and
  its live-quote series are two independently-seeded mock generators (see
  the existing "mock prices aren't anchored to trigger price" note above),
  so a "max drawdown since trigger" can come back positive (price never
  closed below the trigger in the mock series) - shown in muted grey, not
  red, exactly because it isn't a real drawdown. Real Kite/Yahoo data
  won't have this artifact.
- **Trade stats' "max drawdown" (§15.1) is a currency amount, not a %.**
  The peak-to-trough decline in cumulative realised P&L, in the trade's
  own currency - this app never tracks account size, so a true
  percentage-of-capital drawdown isn't knowable (lib/trade-stats.ts).
- **"If I had held" is labelled indicative**, per BRIEF.md §17.4: any
  site-calculated number from Kite/Yahoo data (not something TradingView
  itself sent) is the site's own best-effort math, shown as a chip on the
  section, not a silent fact.

## Connecting the real TradingView alerts

- **The webhook secret can also travel in the URL's query string**
  (`?secret=...`), not only the alert message's `"secret"` field
  (`lib/webhook/process.ts` - `processWebhookQuickPath`'s new optional
  `querySecret` parameter; the body wins when it actually has a secret).
  Found necessary once Praveen's real alerts were inspected (via the
  TradingView MCP's alert-log tool): his two stock-alert scripts
  (`W-Stage2 - US`/`- INDIA`) already build the *exact* JSON this site
  expects, secret included - but the `Sector Board – Weekly` alert's
  message is built entirely inside a Pine `alert()` call with no
  `"secret"` field, and that same script/alert also still feeds Praveen's
  Google Sheet (BRIEF.md §2, "keep that untouched"). Editing the live
  script to add one would risk that working Sheet pipeline for an app
  feature. Putting the secret in the URL instead needs no Pine edit at
  all: duplicate the alert in TradingView (never edit the original). The
  README documents this as the fallback for exactly this situation.
- **Production `WEBHOOK_SECRET` was set to match what's already embedded
  in Praveen's live Pine scripts** (seen in the same alert-log
  inspection - never written down here or anywhere else in the repo),
  rather than asking him to change three real, currently-working alerts
  to a new secret. Zero message edits needed for the two stock-alert
  duplicates as a result - only the sector-board duplicate needs the
  URL's `?secret=` fallback above.

## Zerodha Kite Connect (India live data)

- **India switches from mock to the real Kite provider the moment
  `KITE_API_KEY`/`KITE_API_SECRET` are set** (`lib/providers/index.ts`) -
  not conditioned on "is there a valid token right now." Once connected
  at all, an expired daily login should show the last good cached price
  marked stale (BRIEF.md §10: "fall back to last close, never crash"),
  which `lib/quotes-cache.ts` already does whenever a provider returns
  nothing - silently swapping back to fabricated mock numbers on a lapsed
  Kite session would be worse, not more honest.
- **Plain `fetch` calls instead of the `kiteconnect` npm SDK**
  (`lib/zerodha/auth.ts`, `lib/providers/kite.ts`) - only three REST
  calls are ever needed (build the login URL, exchange `request_token`,
  quotes/historical), so a whole SDK dependency for that is more surface
  than it's worth.
- **Token expiry is estimated as the next 6:00 AM IST**, since Kite's API
  never actually returns an explicit expiry - it just invalidates the
  previous day's session around that time (`lib/zerodha/auth.ts`'s
  `next6amIst`). Shown in Settings so "reconnect" never comes as a
  surprise.
- **Historical candles need Kite's own numeric `instrument_token`, not a
  trading symbol** - `lib/zerodha/instruments.ts` fetches and caches
  NSE's full instruments dump (a large CSV) once per process (24h TTL)
  and looks up each ticker by `tradingsymbol`. The parser reads the token
  and symbol columns positionally rather than with a general CSV parser,
  since both come before the one column (`name`) that can itself contain
  a comma - tested against exactly that case.
- **The 2-year sector index history backfill (BRIEF.md §7.2) is now
  built** - see the dedicated section below. (Stock-level history for
  Performance's "if I had held"/shortlist stats already backfills itself
  on demand per ticker, `lib/price-history-backfill.ts` - that part
  needed no new infra, just the rate limiter above.)
- **No nightly Saturday refresh cron for Kite data either** - same
  reasoning as the backup/health crons already noted above: real infra
  that doesn't exist yet, not quietly assumed to work.
- **Performance page: quote/history lookups for a whole shortlist run in
  parallel, not one ticker at a time.** Found immediately after Zerodha
  went live: `lib/performance-data.ts` used to `await` a quote fetch and
  a history backfill per ticker inside a plain `for` loop - invisible
  with the near-instant mock provider, but with a real provider (Kite or
  Yahoo) each of those is a genuine network round trip, and a shortlist
  of dozens of triggered stocks made the whole page painfully slow.
  Fixed by resolving all symbol mappings, batching the quote fetch into
  one call, and running the per-ticker history backfills with
  `Promise.all` instead. Also made concurrent instrument-token lookups
  (`lib/zerodha/instruments.ts`) share one in-flight fetch of Kite's
  (multi-MB) instruments dump instead of each starting their own.
- **A real rate limiter (`lib/rate-limiter.ts`) now throttles every Kite
  historical-candles call to ~3/second** (BRIEF.md §7.2/§11's own number).
  The parallelization above wasn't the whole story: Praveen reported
  "almost all pages" slow, not just Performance, and
  `lib/db/sector-metrics-orchestrator.ts` + `lib/traded-value.ts` already
  fired off every sector's (and every sector's every constituent's)
  history fetch via `Promise.all` - correct for the mock/Yahoo providers,
  but against Kite's real ~3 req/s limit that's hundreds of concurrent
  requests at once, almost certainly getting throttled/slowed by Kite
  itself. One shared, lazily-armed limiter (no persistent timer, so it
  behaves on a serverless instance) wraps the single network call inside
  `lib/providers/kite.ts`'s `fetchDailyCandles`, so it holds regardless
  of which page or job is asking - sector-metrics recompute, Performance,
  and the price-history backfill can all be in flight at once and still
  never exceed Kite's real limit. Quotes are exempt - one batched call
  covers any number of symbols, so there's nothing to throttle there.

## 2-year sector index history backfill (BRIEF.md §7.2)

- **Scope: sector INDEX history, not every ticker.** The brief's "2 years
  of weekly index history (plus 52 weeks warm-up for RS)" is about
  `sector_snapshots` (stage + Mansfield RS per sector per week), so
  `Δ4/Δ13/Δ26/Δ52` trend numbers mean something immediately instead of
  being null until 52+ real weekly alerts have fired. Per-ticker daily
  history (Performance's "if I had held"/shortlist stats) already
  backfills itself on demand - that's `lib/price-history-backfill.ts`,
  untouched here. Traded value is also untouched: it's "this week vs its
  own trailing 10-week average," computed fresh every time from recent
  constituent history, not something 2 years of itself is useful for.
- **Split into a pure engine + a thin orchestrator**, same shape as
  `lib/sector-metrics.ts`/`lib/db/sector-metrics-orchestrator.ts`:
  `lib/sector-backfill.ts` turns a plain array of weekly closes (sector +
  benchmark) into stage/mrs/vsMa/chg4/focus rows, fully unit-testable
  with no DB or provider involved; `lib/db/sector-backfill-orchestrator.ts`
  fetches daily candles per sector (via the existing provider interface,
  so it's Kite for India and Yahoo for US automatically), aggregates to
  Friday-ending weeks, and writes the result.
- **Fetches ~1 year more than it stores** (104 stored weeks + 52-week RS
  warm-up + ~34 weeks for the 30-week MA's own warm-up) so the *first*
  stored week already has a real stage and mrs, not nulls that only
  resolve a year into looking at the chart.
- **Never overwrites an `'alert'`-sourced week (BRIEF.md §17.4).** The
  orchestrator reads existing snapshot history first, skips any week a
  sector already has from a real webhook, and only writes the rest -
  backfilled rows are tagged `source: 'backfill'` same as before. Re-running
  is safe: it just re-fetches and overwrites its own prior backfill rows.
  Bulk-upserts one call per sector (`upsertSectorSnapshotsBulk`) rather
  than one request per week - at 104+ weeks x ~28 sectors, one-row-at-a-time
  would be both far too slow for a single request and far too chatty
  against Supabase's free tier.
- **Found and fixed a pre-existing bug while wiring this up**: sector
  index symbols are stored TradingView-style with an exchange prefix
  (`sector_map.provider_symbol`, e.g. `"NSE:BANKNIFTY"`), but
  `lib/zerodha/instruments.ts`'s instrument-token lookup is an exact match
  against Kite's own `tradingsymbol` column, which has no such prefix -
  so every sector index lookup (not just the backfill; the existing "1W
  index price change" on the Sectors page too) was silently returning no
  data. Fixed with `stripExchangePrefix()` in `lib/providers/kite.ts`,
  applied before every instrument-token lookup; stock tickers never carry
  a prefix so it's a no-op for them.
- **Still honest about what it can't resolve yet**: only 4 of India's 28
  sectors have a brief-confirmed symbol (`sector-map-seed.ts`) - the rest
  show up as "no resolved symbol yet" in the backfill's own result banner
  (same sectors Settings already lists as "unresolved sector indices").
  India's benchmark for Mansfield RS (`NIFTY_TOTAL_MKT`, `lib/regime.ts`)
  is itself unresolved against a real Kite instrument - so even the 4
  resolved India sectors will likely backfill `stage` correctly but `mrs:
  null` until a real Kite tradingsymbol for that benchmark is confirmed.
  US is fully resolved (11 sectors + 18 industries, real ETF tickers via
  Yahoo) and should backfill both stage and mrs cleanly.
- **Triggered manually from Settings** (owner-only, same `isOwnerEmail`
  gate as Connect Zerodha) rather than running automatically on first
  Kite connect - BRIEF.md calls it "on first run" but an unattended,
  rate-limited batch job across ~28 sectors is exactly the kind of thing
  that should be a deliberate click, not something that silently fires
  (and silently fails) the moment a token is saved. `maxDuration = 60` on
  the route since even rate-limited this is doing real work, not an
  instant API call.
- **First real run confirmed the suspicion above**: all 4 of India's
  "known" sector symbols (`BANKNIFTY`, `CNXPSUBANK`, `CNXIT`,
  `NIFTY_IND_DEFENCE`) returned "no price data" even with Zerodha
  genuinely connected - they're TradingView's names for these indices,
  not necessarily Kite's own `tradingsymbol`. Rather than guess the real
  ones (risk of silently fetching the wrong index), added a small
  owner-only "Find a sector's real Kite symbol" tool on Settings:
  `lib/zerodha/instruments.ts` now also parses and caches just the
  `INDICES`-segment rows from the same instrument dump it was already
  fetching (`parseIndexInstruments` - reads `segment`/`exchange` from the
  *end* of the CSV line, since `name` is the field that can contain a
  comma, same reasoning as the existing tradingsymbol/token parse), and
  `searchIndexInstruments` matches a query against both tradingsymbol and
  name. The owner searches (e.g. "bank"), sees Kite's real index names,
  and confirms the right one per sector (`setSectorSymbol`, new
  `/api/admin/sector-map-resolve` route) - no code change or redeploy
  needed to fix a wrong symbol, and the same tool works for any of the
  24 still-unresolved India sectors as he confirms them over time.

## Site-wide performance pass + UI cleanup + feature batch (16-issue request)

- **Root cause of "every page is slow", confirmed by reading the code,
  not guessed**: `lib/breakouts-data.ts` and `lib/dashboard-data.ts` both
  called `listAlerts({})` with NO filter - a `select("*")` of every alert
  ever stored, JSON blob columns (`raw`/`fundamentals`/`quality_breakdown`)
  included, just to reduce it to one value (the latest week_ending, or a
  "new since last visit" count). `lib/db/alerts.ts`'s `getLatestWeekEnding`
  is now a narrow `ORDER BY week_ending DESC LIMIT 1`, and a new
  `countAlertsCreatedAfter` is a `COUNT`, not a fetch-then-`.length`.
  Scales with "how many alerts have ever existed," which only ever grows -
  not something to re-pay on every single page view.
- **Pullbacks' own extra slowness**: `buildRow`'s "original breakout"
  lookup (`findLatestBreakout`) and its symbol-mapping lookup
  (`getSymbolMapping`) were both called once PER ROW - an N+1 that hits
  Pullbacks twice (symbol mapping + breakout lookup) for every pullback on
  the page. Both are now fetched once per distinct market present on the
  page (`listSymbolMappingsForTickers`, one `listAlerts({market,
  signalType:"breakout"})` per market) and looked up in memory per row.
- **Dashboard/Sectors fetched the sector-backfill's own full history on
  every view**: `listSectorSnapshotHistory` has no limit by design (the
  ranking engine's Δ52 needs real lookback, and the 2-year-backfill
  orchestrator needs the full history to detect which weeks already came
  from a real alert) - but `lib/sectors-page-data.ts` only ever needed the
  last ~16 weeks (a 13-week sparkline + the current week). New
  `listRecentSectorSnapshotHistory(market, sinceWeekEnding)` bounds that
  one call site; the ranking engine and the backfill orchestrator keep
  using the full-history function untouched.
- **Breakouts/Pullbacks' initial JS bundle included `lightweight-charts`**
  (confirmed: a 176KB/56KB-gzipped chunk) even when no row was selected,
  because `BreakoutsTable` statically imported `SidePanel`, which
  statically imports the chart. `SidePanel` is now `next/dynamic(...,
  {ssr:false})` with a skeleton `loading` fallback - that chunk now only
  downloads once a row is actually clicked.
- **Loading skeletons** (`components/Skeleton.tsx` + a `loading.tsx` per
  route) for Dashboard/Breakouts/Pullbacks/Journal/Settings, so a slow
  server render shows a skeleton instead of a frozen blank page -
  independent of the fixes above, since even a fast page has *some*
  render time.
- **Top banners removed from the shared layout, not patched per-page**:
  `RegimeBannerClient` lived in `app/(app)/layout.tsx`, so it rendered on
  every single page - that's why it showed up on Breakouts/Pullbacks even
  though neither page ever imported it. Deleted outright (not hidden):
  Dashboard already has its own dedicated `RegimeCard` widget, and the
  Sidebar already shows India/US stage as small dots on every page, so
  nothing is lost. `DataFreshnessStrip` ("Prices updated"/"Alerts
  received") is removed from Breakouts/Pullbacks specifically (asked for);
  Dashboard/Journal/Settings keep it since nobody asked to remove it
  there.
- **Settings sidebar "jumping to the bottom" bug, found and fixed**: the
  sidebar `<aside>` had no sticky positioning, so with `flex`'s default
  `align-items: stretch` it stretched to match the *main content's*
  height - on a long page (Settings), the email/sign-out block at the
  bottom of the sidebar's own flex column got pushed down to match that
  height, landing at the very bottom of the whole page. Fixed with
  `sticky top-0 self-start h-screen overflow-y-auto` - CSS-only, no
  layout restructuring. Mobile was never affected (separate drawer).
- **Quotes manager collapsible**: wrapped the (potentially long) quotes
  list in a native `<details>` with a bounded, scrollable inner list
  instead of letting it grow the whole Settings page. The login page's
  own quote display (`LoginQuoteRotator`) shows one quote at a time and
  was never affected by this.
- **Dashboard grade/pullback counts are now links** (Issues 9/10) to the
  matching filtered Breakouts/Pullbacks view (market + week + grade)
  instead of static numbers.
- **"Add to ▾" (Issues 11/12)**: a small extensible dropdown
  (`components/journal/AddToButton.tsx`) added to every Breakouts/
  Pullbacks row, Journal only for now, a disabled "Watchlist (soon)"
  placeholder for later. Found and fixed a real pre-existing bug while
  doing this: the side panel's "Log trade" button was `disabled` with a
  stale `title="Journal arrives in Phase 3"` - Journal shipped a long
  time ago (Phase 3 is done), the button was just never wired up
  afterwards. It now uses the same `AddToButton`.
- **Live ticker search (Issue 13)**: `lib/db/alerts.ts`'s
  `searchTickerSuggestions` (debounced 250ms client-side in
  `FilterBar.tsx`) matches on ticker first, then sector/industry text.
  Honesty note: the data model has no company-name field anywhere -
  TradingView's alert payload only ever sends ticker/exchange/sector/
  industry - so "name" matching is approximated via sector/industry, not
  a real company name. A real one would need a new ticker->name mapping
  table, out of scope here.
- **Reset all data (Issue 14)**: scoped to the currently-selected market
  only, never both - the app already treats India/US as separate journals
  everywhere else (the Journal page's own copy says so), so one click
  wiping both would be a surprising landmine. Confirmation requires
  typing "RESET", stronger than the plain `confirm()` already used for
  single-trade delete, since this can erase many trades at once.
- **Per-trade delete with confirmation (Issue 15) was already built** -
  every trade row already had a Delete button with a `confirm()` dialog.
  No change needed; verified it still works after the other edits.
- **P&L calendar (Issue 16) is a new feature, not a bug fix** - audited,
  there was no calendar anywhere in the app before this. Built
  `lib/journal-calendar.ts` (pure, fully unit-tested month-grid engine)
  rendered by `components/journal/PnlCalendar.tsx`. Scope decision: a
  day's P&L is the sum of REALISED P&L for trades whose `sell_date` falls
  that day (closed trades only - open trades already have a home on the
  Open trades table/Dashboard). Timezone-safety was the explicit worry
  here, so this code never relies on `date-fns format()` reading a
  UTC-built Date's *local* getters (a real, if currently dormant, trap
  that `lib/time.ts`'s pre-existing `weekEndingForAlert` happens to also
  have, masked only because Vercel's Node runtime defaults to TZ=UTC) -
  every date string in `journal-calendar.ts` is built manually from
  `getUTC*` components. New `lib/time.ts`'s `todayInMarketTimezone`
  (same fix) picks the calendar's default month correctly in IST
  regardless of the server process's own timezone.
