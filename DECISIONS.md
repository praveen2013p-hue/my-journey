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

## Dashboard: "Open trades & P&L" replaced with "Market snapshot"

- Requested directly: remove the Open trades/P&L widget from Dashboard,
  show broad index levels instead (Nifty 50/Sensex/Midcap 100/Smallcap
  100 for India; a sensible US equivalent, since none was specified -
  chose S&P 500/Nasdaq/Dow Jones, the standard US market trio). Open
  trades/P&L wasn't deleted as a feature - it already lives on the
  Journal page; `components/dashboard/OpenTradesCard.tsx` and
  `lib/dashboard-open-trades.ts` were deleted since Dashboard was their
  only caller.
- **India never falls back to Yahoo.** Yahoo has no reliable Midcap-100/
  Smallcap-100 ticker, and this app's own stated principle for India
  (`lib/providers/index.ts`'s own comment) is "show unavailable, don't
  substitute a different provider's numbers" - so `lib/market-snapshot.ts`
  only ever uses Kite for India (`kite.getIndexQuotes`, a new method
  alongside the existing `getQuotes`, needed because indices aren't
  per-market stock tickers - Sensex is BSE, not NSE, so each needs its
  own explicit exchange rather than `getQuotes`'s "always NSE" shortcut).
  When Zerodha isn't connected, all four India indices show "unavailable"
  together, not three real numbers and two silently-wrong ones.
- **Symbols used** (same honesty-first lesson as the sector-symbol mixup
  earlier in this file): `NSE:NIFTY 50`, `BSE:SENSEX`, `NSE:NIFTY MIDCAP
  100`, `NSE:NIFTY SMLCAP 100`, hardcoded in `lib/market-snapshot.ts`.
  These are Kite's standard, widely-documented index tradingsymbols, not
  a guess the way `BANKNIFTY` turned out to be - but I have no live Kite
  session to verify them from this sandbox. Unlike the sector symbols,
  there's no Settings UI to fix these without a code change if one is
  wrong (they're constants, not a `sector_map` row) - if any shows blank
  once deployed with Zerodha connected, tell me which one and I'll adjust
  the symbol directly.
- US routes through `getProviderForMarket("US")`, not the Yahoo singleton
  directly, so `FORCE_MOCK_US` still works for tests/offline demos - the
  same pattern every other Yahoo-backed feature in this app already uses.

## Bug found testing the sector board alert live, 2026-11-25

- Praveen fired his real "Sector Board – Weekly" Pine script live
  (market open) to verify the whole pipeline end to end. The alert fired
  and the webhook returned 200 OK, which looked like success - but
  Vercel's own runtime-error log showed the *deferred* storage step
  failing every time with a `ZodError` on `rows[n].rsUp`.
- Root cause: the Pine script sends `"rsUp":null` for a sector whose
  `mrsChg` is `na` (not enough RS history yet - true for a couple of this
  user's actual sectors, e.g. newer/thinner ones). `SectorRowSchema` in
  `lib/webhook/schemas.ts` had `rsUp: z.boolean().optional()` - missing
  `.nullable()`, unlike every sibling field (`rs`, `vsMA`, `chg4`), which
  were already `.nullable().optional()`. Zod validates the whole payload
  as one object, not row-by-row, so one bad `rsUp` anywhere in `rows`
  rejected the entire snapshot - not just that one sector (a sharper
  problem than §17.6's "partial snapshot" case, which is about a
  shortened `rows` array, not a type mismatch inside a row).
- Why this looked like success: §17.1's "never throw out of deferred
  work" principle (`processAcceptedPayload`'s try/catch, logs and moves
  on) means a 200 OK to TradingView only ever meant "the secret was
  valid and we queued it for processing" - never "it was stored." This
  is correct behavior for the webhook contract, but means a schema bug
  like this one is invisible from TradingView's side entirely; only
  Vercel's runtime-error log (or Settings -> Alert health, which tracks
  `alerts_raw.processed_at`/`reason`) would show it.
- Fixed with one token: `rsUp: z.boolean().nullable().optional()`.
  `lib/webhook/process.ts` already did `row.rsUp ?? null` on the
  consuming side, so nothing else needed to change. Added a regression
  test (`lib/webhook/process.test.ts`) that reproduces the exact failure
  (two rows, one with `rsUp: null`) and asserts both rows are actually
  stored - confirmed it fails without the fix (0 rows stored) and passes
  with it.

## Auto-suggested sector symbols in Settings

- Resolving the 24 still-unconfirmed India sector symbols one at a time
  (manual search box, type a query, read results, type the symbol into a
  separate form) was the obvious next bottleneck once the alert pipeline
  was fully verified live. Settings now runs a search *automatically*
  per unresolved sector (`sectorSearchKeyword(display_name)` through the
  existing `searchIndexInstruments`) and shows up to 3 candidates as
  one-click buttons right next to each unresolved sector chip - a form
  posting straight to the existing `/api/admin/sector-map-resolve` route,
  no typing needed when a match is found. The manual search box stays as
  the fallback for sectors `sectorSearchKeyword` can't find (e.g. where
  TradingView's name and Kite's diverge further than stripping "&" and
  parentheticals can bridge).
- `sectorSearchKeyword` only strips the two things TradingView's naming
  carries that Kite's real index names don't (a parenthetical aside like
  "PSE (PSU cos)", and "&" as in "EV & New Auto") - it doesn't attempt
  anything smarter (abbreviation expansion, synonym lists), since a wrong
  "smart" guess risks matching confidently to the wrong index, which is
  worse than "no match, use the search box."
- Still not solved by this: the Mansfield RS benchmark
  (`BENCHMARK_SYMBOL.IN` in `lib/regime.ts`, currently the placeholder
  `"NIFTY_TOTAL_MKT"`) isn't a `sector_map` row - it's a hardcoded
  constant, so there's nothing for this UI to resolve. Fixing it needs
  the real Kite tradingsymbol found (e.g. via the manual search box,
  searching "total market" or "nifty 500") and then a one-line code
  change here, the same way the market-snapshot index symbols work.

## Sectors page: click a sector, see its stocks

- Requested directly: clicking a sector should show all its stocks, not
  just the ranking numbers. "All its stocks" is the uploaded constituent
  list (`sector_constituents` - Settings' CSV upload), not just whichever
  ones happen to have triggered an alert this week - the latter is
  already visible via Breakouts/Pullbacks' sector filter.
- Same shape as Breakouts' row-click side panel, for consistency:
  clicking a `SectorsTable` row opens `ConstituentsPanel`, which fetches
  `GET /api/sectors/constituents?market=&sector=` (same route the CSV
  upload already POSTs to - a natural place to colocate the read) and
  shows each ticker with a live quote via the existing `useQuotes` hook.
  Day's % change comes from the quote's own `previousClose`, same as
  everywhere else - there's no "trigger price" to compare against for a
  ticker that was never an alert.
- A constituent that's never appeared in an alert has no `symbol_map` row
  yet (that row is only created when an alert first mentions a ticker),
  so it shows "unavailable" rather than a guessed provider symbol - new
  `getConstituentQuoteRows` batches the `symbol_map` lookup once per
  sector (not once per ticker - the same N+1 lesson as
  `lib/breakouts-data.ts`).
- `AddToButton`'s `alertId` is now `string | null` (was required) so the
  panel can offer "Add to Journal" for a constituent with no alert behind
  it at all - the id-suffix used for form element ids falls back to the
  ticker when there's no alert id to use instead.

## Settings page: stream the Kite auto-suggest section instead of blocking

- Reported as "the site is very slow loading everything." The real culprit
  was narrower: Settings was awaiting up to ~24 Kite index searches (one
  per unresolved sector, for the auto-suggest feature above) before
  rendering anything at all, and each search can trigger a re-fetch of
  Kite's multi-MB NSE instrument dump on a cold serverless instance.
- Fix: moved the "Unresolved sector indices" and "Find a sector's real
  Kite symbol" blocks into their own async Server Component
  (`UnresolvedSectorSymbols`) wrapped in `<Suspense>`. The rest of
  Settings (site name, alert health, quotes, tags, CSV upload) now
  renders immediately; this one section streams in separately.

## Sectors page: total stocks + RS>0 breadth per sector

- Requested directly: show, per sector, the total number of uploaded
  constituent stocks, and of those, how many have RS (Mansfield RS,
  `mrs`) above 0 as of their latest alert. Added as two new sortable
  columns ("Stocks", "RS > 0") on the main `SectorsTable` - one row per
  sector already, so a column fit more naturally than reusing the
  per-sector `ConstituentsPanel` drill-down built above.
- `rsAbove0`/`totalStocks` are both `null` (shown as "—") for a sector
  with no constituent CSV uploaded yet - never a guessed 0.
- New `getLatestMrsForTickers(market, tickers[])` in `lib/db/alerts.ts`:
  one batched query for every ticker on the page, not one per ticker -
  same N+1 lesson as the rest of this codebase. "Latest" means the
  ticker's most recent alert by `triggered_at`, across both signal types,
  so an old breakout's RS doesn't outrank a newer pullback's.
- New `listConstituentsBySector(market)` in `lib/db/sector-constituents.ts`:
  one query for every sector's tickers, instead of one `listConstituents`
  call per sector.
- While already touching `SectorsTable.tsx`: hoisted its `SortHeader` out
  of render to module scope (same "component created during render" fix
  already applied to `BreakoutsTable.tsx` earlier) rather than add two
  more instances of a pre-existing lint error.

## Feature backlog (not building yet, 2026-11-25)

Asked what else a technical analyst would want, given the existing
Weinstein-stage + Mansfield-RS foundation. Parked here, not built:

- Market breadth indicator (% of stocks above 30W MA, or new-highs vs
  new-lows count) - confirms the Market Regime light with real breadth.
- Stock RS Rating as a 1-99 percentile vs the whole universe (raw `mrs`
  isn't comparable across stocks on its own).
- Double RS confirmation - a stock's RS within its own sector, not just
  vs the market benchmark, to separate true leaders from sector riders.
- Distribution-day counter - high-volume down weeks on the benchmark or
  leading stocks, as an early Stage-3 warning.
- Sector rotation matrix - historical RS rank per sector by week as a
  grid, instead of one sector's sparkline at a time.
- Stage-duration backtest from the existing `price_history` store -
  average weeks in Stage 2 before a breakout succeeds vs fails back.

Second round, asked again for "world class" ideas - still just parked:

- RS/price divergence warning - price makes a new high but RS doesn't
  confirm, an early Stage-3 top signal.
- Volatility Contraction Pattern (VCP) detection - tightening range/ATR
  before breakout, feeding into the existing A/B/C grade as a filter.
- R-multiple risk management in the Journal - ATR-based stop suggestion
  and position sizing by risk %, trades tracked in R-multiples not just
  ₹/$ P&L.
- Quality Score back-test/calibration - check whether Grade A/B/C and
  Quality Score actually predict realized journal P&L, not just assumed.
- Composite Risk-On/Risk-Off score - one number from market breadth +
  sector rotation + benchmark stage, instead of three separate signals.
- FII/DII flow overlay (India) - institutional buy/sell flow as a macro
  confirmation layer at index Stage transitions.

## Building 7 of the 12 backlog features, 2026-11-25

Asked to "build all" 12. Investigated first and found 3 (market breadth,
RS/price divergence, VCP) need a new continuous per-stock weekly price
history subsystem that doesn't exist yet, and FII/DII has no integrated
data source - presented this and the user chose to build the 7 feasible
ones now, leaving those 4 as backlog (unchanged above). What shipped:

- **Stock RS Rating**: `lib/rs-rating.ts`'s `computeRsRatingPercentiles`
  - a 1-99 percentile rank of a ticker's latest `mrs` among every ticker
  this app has ever alerted on in its market (new
  `getLatestMrsForAllTickers` in `lib/db/alerts.ts`), not "the whole
  market." New "RS Rating" column on Breakouts/Pullbacks.
- **Double RS confirmation**: `lib/constituent-rs.ts`'s `withSectorRs` -
  a constituent's own RS vs its sector's median RS (leader/laggard/in
  line). Lives in its own file, not inside
  `lib/db/sector-constituents.ts`, to avoid a module import cycle
  (`sector-constituents.ts` -> `sector-context.ts` -> `alerts.ts` would
  loop back). Wired into `ConstituentsPanel`'s existing stock-list table
  via the same `/api/sectors/constituents` route.
- **Sector rotation heatmap**: `lib/sector-rotation.ts` ranks each
  sector by `mrs` within each of the last 13 weeks (sectors only, not
  industries - rotation is a sector-level concept) from snapshot history
  already fetched elsewhere. New grid on the Sectors page,
  `RotationHeatmap`.
- **Distribution-day counter**: `lib/distribution-days.ts` - the
  classic IBD/O'Neil rule (benchmark closes down >=0.2% on higher volume
  than the prior day), counted over the last 25 sessions for the
  benchmark only (one symbol, not every stock - keeps it cheap under
  Kite's 3 req/s historical-data limit). Needed `DailyBar` to carry
  `volume` (previously parsed by Kite's candle fetch, then dropped) -
  added to `lib/providers/types.ts` and all three providers
  (Kite/Yahoo/mock). Shown as a line under each market's index list on
  Dashboard's Market snapshot card. For India this stays "—" until the
  benchmark's real Kite symbol is resolved (same known gap as the regime
  light itself).
- **Composite Risk-On/Risk-Off score**: `lib/risk-score.ts` - a
  documented heuristic (not a calibrated model) averaging whichever of
  three signals are available: benchmark Weinstein stage, % of sectors
  in Stage 2 this week (a sector-level stand-in for breadth), and
  sectors' average 1-week RS change. New `RiskScoreCard` on Dashboard.
- **R-multiple risk management**: added an optional `stop_loss` to
  trades (nullable, never required). `lib/trade-stats.ts`'s `rMultiple`
  is null whenever there's no stop, or the stop isn't below the buy
  price (no defined risk to divide by) - this app only tracks a buy
  then a sell, no short-side field. New field on both "add to Journal"
  forms (`AddToButton`, `AddTradeModal`), an "R" column on closed
  trades, and an "Avg R-multiple" stat card.
  **Needs a Supabase migration before this works in production**:
  `supabase/migrations/0002_trades_stop_loss.sql` adds the column.
  Confirmed via Vercel that this project's `NEXT_PUBLIC_SUPABASE_URL`/
  `SUPABASE_SERVICE_ROLE_KEY` are set, i.e. production really runs
  against Supabase (not the local JSON store) - so trade creation/update
  will error referencing `stop_loss` until that migration is run in the
  Supabase SQL editor.
- **Quality Score calibration**: `lib/quality-calibration.ts` groups
  closed trades (only ones logged from an alert, via `trade.alert_id`)
  by their alert's Grade and by Quality Score bucket (0-39/40-59/
  60-79/80-100), showing win rate/avg return/avg R per bucket - whether
  the score actually predicted the outcome, not assumed. New
  `getAlertsByIds` batched lookup in `lib/db/alerts.ts`. New
  `QualityCalibrationTable` section on the Performance page.

## Mutual Funds: manual monthly tracker, 2026-11-25

- Requested directly: replace the user's Google Sheet, where they
  manually tracked one overall mutual fund portfolio month by month.
  Asked two scoping questions before building (getting this wrong means
  re-entering years of history): confirmed **one aggregate number**
  (not per-scheme), and confirmed each month's entry is **that month's
  contribution + current portfolio value** - "total invested to date"
  is never stored, only derived by summing every month's contribution
  up to and including that month (`lib/mutual-fund-stats.ts`'s
  `buildMutualFundView`) - one fewer number to type (and get wrong)
  each month. India-only (₹), since that's this user's context; no
  market toggle like Journal/Breakouts.
- New `mutual_fund_entries` table (`supabase/migrations/
  0003_mutual_fund_entries.sql`), one row per user per calendar month
  (`unique (user_id, month)`), same per-user RLS pattern as `trades`.
  `lib/db/mutual-funds.ts` repo mirrors `trades.ts`'s shape
  (list/get/upsert-by-month/update/delete).
- All date math in `lib/mutual-fund-stats.ts` (`shiftMonth`,
  `monthLabel`) is plain integer arithmetic on "yyyy-mm-01" strings,
  never a `Date` object - the same reason as `lib/journal-calendar.ts`.
  "vs last month" / "vs same month last year" on the dashboard only
  fill in when an entry for that *exact* calendar month exists - never
  approximated from whichever entry happens to be array-adjacent (a
  skipped month shows "—", not a wrong comparison).
- New `/mutual-funds` page: `MutualFundDashboard` (totals + both period
  comparisons), `YearSection` (one collapsible `<details>` per year,
  most recent year first, months newest-first within it, inline
  edit/delete per month - same pattern as `TradesTable`'s
  `CloseTradeForm`), `AddEntryModal` (re-submitting an existing month
  replaces it, by design - the upsert-by-month constraint). New sidebar
  nav entry + `MutualFundIcon`.
- Verified live in a browser (not just unit tests): added 6 months
  across 2019/2020/2026, confirmed the dashboard, year rollups and
  per-month cumulative-invested all recompute correctly after an edit
  and after a delete, on both desktop and mobile viewports.

## Mutual Funds: Planned and Withdrawn columns, 2026-11-25

- Two more optional per-month fields, requested directly: `planned_amount`
  ("required amount to be invested, as per your plan" - purely
  informational, shown next to Added, color-coded green/red by whether
  that month's Added met or missed it, with a one-line legend) and
  `withdrawal` (any amount pulled out that month).
- Unlike `planned_amount`, `withdrawal` **does** feed the math: it nets
  out of "invested to date" and the year rollup's "Added" total, the
  same direction a contribution moves it the other way - money
  withdrawn is money no longer in the fund. `buildMutualFundView`'s
  running sum is now `amount_added - withdrawal` per month, not just
  `amount_added`.
- New additive migration (`0004_mutual_fund_planned_withdrawal.sql`)
  rather than editing `0003` - the same reason `stop_loss` got its own
  `0002` instead of changing `0001`: a migration already run against
  the live database can't be edited after the fact.
- Verified live: a month with Added >= Planned shows green, a month
  short of Planned shows red, and a withdrawal correctly reduces both
  that month's and the year's invested total.

## Mutual Funds: XIRR, 2026-11-25

- Requested directly, both "at final level and individual month level."
  The simple gain % already shown doesn't account for *when* each
  contribution/withdrawal happened - XIRR (Extended IRR, Actual/365 day
  count, same convention Excel/Sheets and SEBI mutual-fund disclosures
  use) is the number that actually does, so it's a real upgrade, not
  just an extra stat.
- New `lib/xirr.ts`: a from-scratch bisection solver (`computeXirr`),
  dependency-free like the rest of this app's math. No closed-form
  solution exists for XIRR, hence the numerical solve; bisection over
  Newton-Raphson because it can't diverge, which matters more here than
  raw speed for a handful of monthly cash flows. `daysSinceEpoch` only
  ever subtracts two `Date.UTC(...)` millisecond values - never reads
  one back through a local getter - so it can't hit the timezone bug
  documented at the top of `lib/mutual-fund-stats.ts`.
- Found and fixed one real bug before shipping: when every cash flow
  falls on the same calendar day (e.g. a month's own contribution and
  its current_value, both dated that month), every discount factor is
  1 regardless of rate, so NPV(rate) is a constant - bisection would
  otherwise return whatever the midpoint of its search range happened
  to be (a nonsense ~450% on the first iteration) instead of recognizing
  there's no rate to solve for. Added an explicit same-day guard; caught
  by a test built from the simplest real case (the very first month,
  where no time has passed), not discovered by accident.
  Tests include one hand-solved multi-flow case (quadratic formula,
  solved independently of the code under test) as a cross-check beyond
  the simple single-period cases.
- `lib/mutual-fund-stats.ts`'s `buildMutualFundView` computes one XIRR
  per row - "point-in-time," using every contribution/withdrawal up to
  and including that month plus that month's own `current_value` as the
  terminal "if I cashed out now" flow. The dashboard's "final" XIRR is
  just the latest row's value, not a separate calculation - verified an
  earlier month's XIRR is unaffected by what the portfolio does later.
  New "XIRR" column (per month) and dashboard stat (overall), both
  green/red by sign. Verified live with the same 10%-in-one-year case
  used in the unit tests.

## Mutual Funds: Valuation/Change columns, 2026-11-25

- Requested directly: rename the per-month table's "Invested to date"
  column to "Valuation", and turn "Current value" into a calculated
  "how much has profit/loss moved" column instead of a static number.
- The absolute current value isn't actually lost - it's recoverable as
  Valuation + Gain, both still shown - so replacing it with a computed
  delta loses no information while directly answering what was asked.
  New `pnlChangeAbs` on `MutualFundEntryView` (`lib/mutual-fund-stats.ts`):
  this month's Gain minus the exact previous calendar month's Gain,
  null (not approximated from an older month) when that exact prior
  month has no entry - same "never guess from array adjacency" rule as
  `vsLastMonth`/`vsLastYear`. New "Change" column, ▲/▼ and green/red.
- Verified live: Jan (first entry) shows "—" for Change; Feb's Gain
  rose 200→800 shows "▲ ₹600"; Mar's Gain fell back to 200 shows
  "▼ −₹600" - both exactly the hand-computed deltas.

## Mutual Funds: Safe SWP column, 2026-11-25

- Requested directly: a "Safe SWP @ 4% of the portfolio" column after
  Notes, as a monthly figure, asterisked, with a footnote naming the
  assumptions (life expectancy 90, nothing left as legacy, returns
  at that month's own XIRR).
- Built as the literal flat-4%-of-current-value figure (`current_value
  * 0.04 / 12`), not a full amortizing annuity calculation that drains
  the portfolio to exactly zero by age 90 - that would need the user's
  current age as an input (how many years remain until 90), which isn't
  captured anywhere in this app. The footnote states the stated
  assumptions as the rationale/methodology behind calling 4% "safe" for
  this profile, matching what was asked almost verbatim, rather than as
  live variables feeding a different formula. Flagged this choice to
  the user; a true "exhaust to zero by a target age using this month's
  XIRR" version is a well-defined, buildable follow-up once they give a
  current age (or birth year) to compute years remaining from.
- Verified live: a ₹3,00,000 portfolio shows exactly ₹1,000/mo
  (300000 × 4% ÷ 12).

## Mutual Funds: Safe SWP becomes a real depletion calculation, 2026-11-25

- Asked for the missing input (current age) flagged in the previous
  entry; user gave their birth year (1992). Replaced the flat-4% figure
  with the real calculation offered: the level monthly withdrawal that
  runs that month's portfolio down to **exactly zero by age 90**,
  assuming it keeps earning that month's own XIRR - a standard
  loan/annuity amortization formula run in reverse (the fund pays the
  investor), not a flat percentage.
- Birth year is **per-user** (new `user_settings.birth_year`,
  migration `0005_user_settings_birth_year.sql`), not a hardcoded
  constant - Praveen and his wife have different birth years and each
  signs in separately. New "Personal" section on the Settings page;
  only the year is asked for (not month/day), so age at a given month
  is approximated as `(that month's year − birth year)`.
  `lib/mutual-fund-stats.ts` takes `birthYear` as a parameter rather
  than reading it itself, keeping the module pure/no-I/O.
- `safeSwpMonthly` is null whenever it can't be honestly computed: no
  birth year set yet, that month's XIRR is itself undefined (e.g. the
  very first entry), or that point in time is already at or past 90 -
  never a guessed number. The Mutual Funds page shows a banner linking
  to Settings when birth year isn't set yet.
- `amortizedPayment` and `monthsUntilTargetAge` are exported and
  tested directly (not only through the full pipeline) - one test
  cross-checks against a well-known amortization-table constant
  (₹100,000 principal, 1%/month, 12 payments → ₹8,884.88), independent
  of this app's own XIRR solver.
- Verified live end-to-end: a ₹11,00,000 portfolio with exactly 10%
  XIRR (hand-verified in an earlier entry) and birth year 1992, as of
  Jan 2026 (age 34, 56 years to 90), shows ₹8,814/mo - matches the
  hand-calculated annuity payment.

## Mutual Funds: Safe SWP adjusted for inflation, 2026-11-25

- User flagged the ₹8,814/mo figure above as "too high" - correctly:
  that number (≈9.6%/year of the portfolio) came from projecting a
  10% *nominal* XIRR flat for 56 years with no inflation at all, which
  overstates how much can really be withdrawn. Fixed by converting the
  nominal XIRR to a **real** (inflation-adjusted) rate via the Fisher
  equation before amortizing: `realRatePct = (1+nominal)/(1+inflation) - 1`,
  assuming 6% long-run inflation (an India CPI ballpark, not user-set -
  a reasonable follow-up if they want it configurable).
  New `realRatePct`, exported and unit-tested directly against a
  hand-solved Fisher-equation value.
- Re-ran the same ₹11,00,000-at-10%-XIRR scenario: now **₹4,278/mo**
  (≈4.24%/year) - sensibly close to the classic "4% rule" ballpark,
  instead of the previous ~9.6%/year. Verified against hand arithmetic
  (real rate ≈3.77%, monthly ≈0.309%, 672 months) to the rupee.
- Caught and fixed a bug in my own test while making this change: one
  new test used 2016→2017 (2016 is a leap year, 366 days) expecting a
  flat 6% XIRR from a clean 1.06x return - the Actual/365 day-count
  correctly solves that to ~5.983%, not 6%, since the period isn't
  exactly 365 days. Not a solver bug; fixed by using a non-leap span
  (2021→2022) in the test instead.

## Mutual Funds: List/Grid view toggle for years, 2026-11-25

- Requested directly: the collapsed year list ("row wise") felt plain;
  asked for a grid/square alternative. Added a List/Grid toggle above
  the years (persisted in localStorage, same pattern as the sidebar's
  collapse preference - a look preference, not data, so it's fine to
  live client-side only).
- List is the existing stacked `<details>` per year, unchanged. Grid
  (`YearGrid.tsx`) shows square year tiles (year, entry count, Added,
  year-end value) in a responsive grid; clicking one selects it
  (gold highlight) and its month-by-month table renders in one shared
  panel below the grid, reusing `YearRows` (now exported from
  `YearSection.tsx`) so the two views share identical table logic
  rather than duplicating it.
- Verified live, desktop and mobile: switching views, clicking
  different year tiles, and that the List/Grid choice survives a page
  reload.

## Mutual Funds: "Total Added" column (gross, distinct from Valuation), 2026-11-25

- Requested directly: "Valuation" (net of withdrawals) wasn't enough -
  user wanted to see their own cumulative contribution regardless of
  any withdrawal taken out later.
- Added `cumulativeAdded` to `MutualFundEntryView`: a running sum of
  `amount_added` only, never reduced by `withdrawal` - "how much of my
  own money have I put in, in total," independent of what's since come
  out. Sits in the table as "Total Added," right after "Added" and
  before "Valuation."
- Verified with a withdrawal example: ₹10,000 + ₹5,000 added across two
  months, ₹3,000 withdrawn in month 2 → Total Added = ₹15,000 (gross),
  Valuation = ₹12,000 (net). Unit-tested directly; confirmed live via
  the rendered table.

## Mutual Funds: sticky Overview row while scrolling, 2026-11-25

- Requested directly: while scrolling down through the months, the
  summary stats (Total invested, Current value, Gain, XIRR, etc.)
  disappeared off the top - wanted them pinned in view at all times.
  Made the Overview card `position: sticky; top: 0`.
- Hit a real layout bug along the way: the page's content wrapper
  (`app/(app)/layout.tsx`) had `overflow-x-hidden` with no explicit
  `overflow-y`. Per the CSS overflow spec, when one axis is non-visible
  and the other isn't set, the browser silently forces the other axis
  to `auto` - which makes that wrapper (not the real scrolling
  viewport) the sticky positioning context. Since the wrapper's own
  height always matches its content (never actually scrolls), the
  sticky element inside it never got a scroll delta to react to, so it
  just scrolled away with the rest of the page instead of sticking.
  Fixed by switching both axes to `overflow-x-clip overflow-y-clip`:
  `clip` is a non-scrolling value, so neither axis gets silently
  promoted to `auto`, and the real document scroll stays in charge.
- This was a page-wide layout fix, not just a Mutual Funds one - any
  future `position: sticky` anywhere in the app now behaves correctly
  against the real viewport. Re-checked the Sectors page (which has a
  wide, horizontally-scrollable table) to confirm `overflow-x` still
  behaves the same as before (no stray horizontal scrollbar).
- Verified live (Playwright): expanded every year, scrolled to the very
  bottom on both desktop (1280px) and mobile (390px) - the Overview
  card stays pinned at the top of the viewport the whole time, with a
  shadow separating it from the month rows scrolling underneath.

## Mutual Funds: renamed column labels, 2026-11-25

- Requested directly: "Added" -> "SIP Amount", "Total Added" -> "Invested"
  in the month-by-month table. Display text only - no change to the
  underlying fields (`amount_added`, `cumulativeAdded`) or any math.

## Mutual Funds: XIRR shown in Grid view, 2026-11-25

- Requested directly: the Grid view's year tiles and detail panel didn't
  show XIRR - wanted "that year return" visible there too.
- Added `yearEndXirrPct` to `MutualFundYearGroup`: the since-inception
  XIRR as of that year's last entry (same number already shown in the
  table's XIRR column for that month - not a separate "calendar year
  only" rate, kept consistent with the "since-inception is enough"
  call made earlier in this project). Unit-tested directly.
- Shown in two places in `YearGrid.tsx`: a fourth stat line inside each
  year tile ("XIRR -98.5%" etc., colored green/red), and a summary line
  below the month-by-month table in the detail panel ("2026 XIRR
  (since inception, as of year-end): -98.5%").
- Verified live: both figures for the same year match each other and
  match that year's last-row XIRR in the table.

## Mutual Funds: allow negative SIP Amount, with an auto comment prompt, 2026-11-25

- Requested directly: allow entering a negative value in the SIP
  Amount column (a correction/reversal from the AMC, say), highlight it
  in red, and automatically offer a small "i" button to enter and save
  a comment explaining it.
- Removed the `min="0"` restriction on amount_added in both the Add
  entry modal and the inline Edit form - the backend already accepted
  negative amounts (no change needed there; the sign convention in
  `lib/mutual-fund-stats.ts` already treats a negative amount_added
  correctly - it reduces both cumulativeAdded and cumulativeInvested,
  and flips the XIRR cash-flow sign the same way a withdrawal does,
  since a negative contribution is economically identical to money
  coming back out). Added a test locking this in.
- New `negative_amount_note` column on `mutual_fund_entries` (migration
  0006) - separate from the general Notes column, since this is
  specifically "why is this one negative," not a general comment.
- New shared `NegativeAmountNoteButton` component: a small "i" badge
  that appears automatically next to the SIP Amount figure whenever
  it's negative (in the Add modal, the Edit form, and the saved-row
  table cell), opening a tiny popover to type and save a comment. Badge
  turns gold once a comment exists, so it's visible at a glance which
  negative months still need an explanation.
- Verified live: typed -2000 in the Add modal, the "i" button appeared
  immediately, saved "NAV correction from the AMC," and confirmed it
  shows up in the saved table row in red with the gold "has a note"
  badge, text persisted correctly.

## Mutual Funds: page subtitle, 2026-11-25

- Requested directly: replaced the subtitle "Your own manual monthly
  tracker - replaces the spreadsheet" with "Aiming for 50 Crore Mutual
  Fund Portfolio" - a personal goal headline instead of a description
  of the feature.

## Mutual Funds: Grid view no longer auto-opens a year, 2026-11-25

- Requested directly: Grid view used to default to the most recent
  year's month-by-month table already open underneath the tiles -
  wanted it closed until a tile is clicked, matching List view's
  collapsed-by-default feel.
- `YearGrid.tsx`: `selectedYear` now starts `null` instead of the most
  recent year, so no table shows until a tile is clicked. Also made
  clicking an already-selected tile close it again (toggle), instead
  of being stuck open once chosen.
- Verified live: switching to Grid view shows zero tables; clicking a
  year tile opens its table; clicking that same tile again closes it;
  clicking a different tile switches to that year.

## Mutual Funds: split a month's addition into SIP / Lumpsum / STP / Other, 2026-11-25

- Requested directly: real contributions are a mix of SIP, lumpsum and
  STP in the same month, and forcing them into one number made
  accurate entry hard. Asked for all the input options to be opened up,
  with the app doing the sum correctly. (Asked the user, and they chose
  keeping one combined "Added" column in the table with the breakdown
  on hover, over always-visible SIP/Lumpsum/STP columns.)
- New columns on `mutual_fund_entries` (migration 0007): `sip_amount`,
  `lumpsum_amount`, `stp_amount`, `other_amount` - all nullable.
  `amount_added` itself is unchanged in meaning (still what every stat
  reads), but is now always *computed* as the sum of these four,
  recomputed server-side from whichever ones the request sends -
  never trusted as a client-sent total, so it can't drift from the
  parts. "Other" is a deliberate catch-all for anything that isn't
  SIP/lumpsum/STP (dividend reinvestment, a bonus-unit credit, etc.).
- Add entry and Edit now show four separate number inputs (SIP,
  Lumpsum, STP, Other) instead of one, each independently able to go
  negative (a correction in just one category), with a live computed
  total and the existing negative-amount-note prompt wired to that
  total rather than to a single field.
- An entry from before this migration has all four columns null -
  never guessed how its one historical amount_added split up; editing
  one parks its whole existing total under "Other" (SIP/Lumpsum/STP
  start at 0), so the total is preserved exactly and nothing is
  invented.
- Table: renamed the "SIP Amount" column back to "Added" (it's no
  longer purely SIP), and a classified month's figure gets a dotted
  underline - hover it to see "SIP ₹X · Lumpsum ₹Y · STP ₹Z · Other ₹W".
  An unclassified (legacy) entry shows no underline/tooltip, since
  there's nothing to show.
- Verified live: entered SIP 5000 + Lumpsum 20000 + STP 3000 + Other
  -1000, live preview showed ₹27,000, saved and confirmed the table
  cell reads ₹27,000 with that exact breakdown on hover; edited a
  pre-existing (legacy) ₹7,000 entry and confirmed its edit form showed
  SIP/Lumpsum/STP = 0 and Other = 7000.

## Mutual Funds: visible labels on the Edit row's breakdown fields, 2026-11-25

- Reported directly: in the inline Edit row, the SIP/Lumpsum/STP/Other
  fields only had placeholder text, which disappears once prefilled
  with a value - so editing an already-filled-in month, you couldn't
  tell which box was which.
- Replaced `placeholder`/`aria-label` with a real, always-visible
  `<label>` above each input (same pattern the Add entry modal already
  used) - the text stays put no matter what's typed in the box.
