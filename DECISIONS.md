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

## Performance review: slow tab/page loading, 2026-11-25

Ran a full audit (measured live with Playwright against a production
build, not guessed) to find why navigation felt slow. Fixed the real
causes found, in order of actual measured impact:

- **The big one**: every page's Sidebar renders all 9 nav tabs, always
  visible, and Next.js's `<Link>` prefetches by default when a link is
  in the viewport - so just sitting on the Dashboard was silently
  triggering a full background server-render of every other tab,
  including Breakouts/Pullbacks with 8 different grade/market filter
  variants (from the Dashboard's own "This week's triggers" quick-links,
  `TriggersCard.tsx`), re-running each one's entire data fetch
  (including live Yahoo/Kite calls) for a page the user never clicked.
  Measured 32 background requests firing from one single Dashboard
  visit. Added `prefetch={false}` to the Sidebar's 9 tab links and
  `TriggersCard`'s 8 breakout/pullback quick-links - confirmed by
  re-measuring: 0 background tab-prefetch requests now, down from 32.
  Real clicks still navigate immediately; they just aren't silently
  pre-warmed anymore. (Left the Dashboard's own Prev/Next-week links
  alone - those stay on the same page and are genuinely likely to be
  clicked next.)
- Two of three Yahoo/Kite call sites had no caching, unlike
  `lib/regime.ts`'s market-regime light, which already had a proven
  1-hour TTL cache for exactly this reason. `lib/market-snapshot.ts`
  (Dashboard's index-level widget) and `lib/distribution-days.ts` made
  a live provider call on every single Dashboard render - and per the
  finding above, "every single Dashboard render" included background
  prefetches, multiplying the cost. Factored the TTL-cache pattern out
  into a small shared `lib/ttl-cache.ts` (unit-tested directly) and
  used it for both: 2 minutes for market snapshot quotes, 15 minutes
  for distribution-day counts (daily-bar data that doesn't change
  intraday anyway).
- Journal had a real N+1: `lib/journal-data.ts` called
  `getSymbolMapping` (one DB round trip) per open trade in a loop,
  of the exact kind `lib/db/symbol-map.ts`'s `listSymbolMappingsForTickers`
  was already built to fix for Breakouts/Pullbacks - Journal just hadn't
  been switched over to it. Now one batched lookup for every open
  trade's ticker instead of N sequential ones.
- `useMarketRegimes` (Sidebar and the Dashboard's RegimeCard both call
  it) fired two separate `/api/regime` requests for identical data on
  every Dashboard visit. Added a tiny client-side in-flight-request-dedup
  + 60s cache in `lib/use-regime.ts` - verified live: exactly 1 request
  fires now even though both components mount.
- Confirmed NOT a problem, worth recording so it isn't re-investigated:
  the Supabase client is already a memoized singleton, every page's
  independent data calls already use `Promise.all` (not sequential
  awaits), `force-dynamic` only appears on API routes (correctly), and
  the one heavy client dependency (`lightweight-charts`) is already
  lazy-loaded. Not touched.
- Measured, full tab sweep after the fixes (production build, cold
  dev-store): every tab loads in 570-950ms with nothing broken.

## Mutual Funds: Overview stats no longer overlap when a percentage is huge, 2026-11-25

- Reported directly: when a stat's percentage (e.g. "Overall gain"'s
  (+X%)) grows wide enough, it was spilling out of its own grid cell
  and visually colliding with the neighboring stat's label/value.
- Root cause: a CSS Grid/Flexbox classic - a grid or flex item's
  default `min-width: auto` lets it grow past its own column to fit
  its content, instead of respecting the column's width. None of the
  Overview card's 6 stat cells had `min-w-0` set, so a long enough
  number/percentage just overflowed into whatever was next to it.
- Fixed in `MutualFundDashboard.tsx`: every stat cell now has
  `min-w-0`, and the two cells that pair an amount with a parenthetical
  percentage (Overall gain, and the "vs last month"/"vs same month
  last year" lines) wrap the percentage onto its own line first
  (flex-wrap) and, only if it's still too wide even alone on a line,
  truncate it with an ellipsis rather than overflow - the full value is
  always still available via a hover tooltip. The primary rupee amount
  itself is never truncated, only the secondary percentage.
- Verified with a deliberately extreme case (a tiny invested base next
  to a huge current value, producing a 4999999900% swing): confirmed,
  programmatically (bounding-box overlap check) and visually (desktop +
  mobile screenshots), that nothing spills into a neighboring stat
  anymore.

## Mutual Funds: fixed "Valuation" showing the same figure as "Invested", 2026-11-25

- Reported directly: "Invested" and "Valuation" columns were showing
  the same value everywhere.
- Real bug, not just confusing naming: "Valuation" was wired to
  `cumulativeInvested` (net cumulative contributions, after
  withdrawals) instead of `entry.current_value` (the actual portfolio
  value the user enters each month). Without a withdrawal, net
  cumulative contributions trivially equals gross cumulative
  contributions - which is exactly what "Invested" already shows - so
  the two columns were bound to look identical for anyone who's never
  used the Withdrawn field.
- Confirmed by cross-checking the Grid view's year tiles, whose "Value"
  figure (`yearEndValue`) was already correctly wired to
  `entry.current_value` - the per-month table's "Valuation" column was
  the inconsistent one.
- Fixed: "Valuation" now shows `entry.current_value` directly, with a
  tooltip ("This month's actual portfolio value, as you entered it").
  `cumulativeInvested` is untouched and still powers the Dashboard's
  "Total invested" stat and all the gain/XIRR math - only where it was
  being displayed changed.
- Verified live: Jan 2026 (added ₹10,000, current_value ₹10,500) and
  Feb 2026 (added another ₹10,000, current_value ₹25,000) now show
  Invested ₹10,000/₹20,000 next to Valuation ₹10,500/₹25,000 - visibly
  different, as expected.

## Mutual Funds: reordered Overview stats, 2026-11-25

- Requested directly: show "Current value" before "Total invested" in
  the Overview row (previously the other way around). Display-order
  only, no change to either figure's math.

## Mutual Funds: Safe SWP switched to the classic 4% rule, 2026-11-25

- User flagged that the age-90-depletion model didn't match how they
  actually think about SWP. Asked directly, and confirmed: the classic
  "4% rule" (Bengen/Trinity study) - 4% of the portfolio's CURRENT value
  per year, recalculated fresh every month - not a one-time amortization
  plan solved for a target age.
- Simplified `computeSafeSwpMonthly` to `currentValue * 0.04 / 12`.
  Removed `realRatePct`, `amortizedPayment`, `monthsUntilTargetAge`,
  `SWP_TARGET_AGE`, `ASSUMED_INFLATION_PCT`, and the `birthYear`
  parameter on `buildMutualFundView` - none of them are needed anymore.
  `safeSwpMonthly` is now a plain `number`, never null (there's no
  longer a "missing birth year" or "already past target age" case to
  guard against).
- Removed the birth-year warning banner from the Mutual Funds page and
  the now-pointless `getUserSettings` call there. Left the birth_year
  setting itself in Settings (don't want to silently drop a value the
  user already entered) but updated its description to say plainly
  that nothing currently uses it.
- Verified live: a single Jan 2026 entry of ₹12,00,000 added and valued
  shows Safe SWP = ₹4,000/mo (exactly 4% ÷ 12), with no birth-year
  dependency and no warning banner.

## Mutual Funds: two-column Overview with a wealth growth chart, 2026-11-25

- Requested directly: split the Overview into two columns - stats on
  one side, a "wealth growing over time" chart on the other. Also
  asked to surface Safe SWP as a headline Overview stat too (confirmed,
  after checking: same 4%-rule figure as the table, not a different
  model - the earlier age-90 question was about the table's column,
  this is just showing that same number in one more place).
- New `WealthGrowthChart.tsx` (client, `lightweight-charts` - same
  library and dark-theme color convention as
  `components/breakouts/WeeklyChart.tsx`): two lines across every month
  on record - portfolio value (gold) and cumulative invested (gray).
  Lazy-loaded via a small `WealthGrowthChartLazy.tsx` wrapper
  (`next/dynamic`, `ssr: false`) so `lightweight-charts`' weight is
  only downloaded by someone who actually opens Mutual Funds, same
  reasoning as the existing Breakouts side panel.
- `MutualFundDashboard` now also takes `rows` (not just `dashboard`) to
  build the chart's per-month series; `buildMutualFundView`'s
  `dashboard` gained `safeSwpMonthly` (the latest row's figure, null
  only when there are no entries yet).
- Verified live, desktop and mobile: 6 months of data show the gold
  value line pulling away from the gray invested line as the portfolio
  grows; Safe SWP in the Overview matches the table's own figure
  exactly (₹233/mo for a ₹70,000 portfolio = 70,000 × 4% ÷ 12); layout
  stacks to one column on mobile.

## Mutual Funds: removed the TradingView attribution logo from the wealth chart, 2026-11-25

- Requested directly: `lightweight-charts` (made by TradingView) shows
  a small attribution logo/link in the corner of every chart by
  default. Disabled it (`layout.attributionLogo: false`) on the Mutual
  Funds wealth growth chart specifically, per what was asked - left
  `components/breakouts/WeeklyChart.tsx` untouched since that wasn't
  part of the request.
- Note for the record: the library's licence asks for either this logo
  or an equivalent attribution link elsewhere on the site - not
  something this private, single-household app needs to worry about,
  but worth knowing if `lightweight-charts` is ever used somewhere
  more public.

## NPS: full structural clone of the Mutual Funds tracker, 2026-11-25

- Requested directly: "the exact same thing which I made for mutual
  fund but this time for NPS." Built a complete, 1:1 structural clone,
  not a simplified version - every design decision Mutual Funds
  accumulated over this project (the SIP/Lumpsum/STP/Other breakdown,
  negative-amount-note prompt, rolling since-inception XIRR, Valuation
  vs Invested distinction, the classic-4%-rule Safe SWP, the two-column
  Overview with a wealth growth chart, List/Grid toggle starting
  collapsed) carries over unchanged, just renamed.
- New table `nps_entries` (migration 0008) - since this is a brand new
  table with no existing production data, it ships with the complete
  final column set in one migration, instead of replaying the 7
  incremental migrations mutual_fund_entries needed to get there.
- Two refactors made along the way, both because the code being cloned
  turned out to have nothing fund-specific about it:
  - `NegativeAmountNoteButton` moved from `components/mutual-funds/` to
    a shared `components/NegativeAmountNoteButton.tsx` - it was already
    fully generic (just "negative amount, add a comment"), so NPS
    imports the same component instead of a duplicate.
  - `monthLabel`/`shiftMonth` extracted from `lib/mutual-fund-stats.ts`
    into a shared `lib/month-utils.ts` (tests moved to
    `lib/month-utils.test.ts`) - plain "yyyy-mm-01" string helpers with
    nothing mutual-fund-specific either. `lib/mutual-fund-stats.ts`
    re-exports both names so none of its existing importers needed to
    change.
  - The wealth-growth chart (`WealthGrowthChart`/`WealthGrowthChartLazy`)
    was deliberately NOT shared - out of scope for this clone, kept as
    a parallel copy under `components/nps/`.
- New files: `lib/nps-stats.ts` (+ tests), `lib/db/nps.ts` (+ tests),
  `app/api/nps/route.ts` + `[id]/route.ts`, `components/nps/*`,
  `app/(app)/nps/page.tsx`, an NPS sidebar entry (with `prefetch={false}`,
  matching every other nav link) and a new landmark-style `NpsIcon`.
- The page's subtitle ("Your NPS portfolio, tracked month by month") is
  a neutral placeholder - Mutual Funds' "Aiming for 50 Crore..." was a
  personal goal told to me specifically for that feature; nothing
  equivalent was said for NPS, so nothing was invented.
- Verified live: added 3 months with a SIP+Lumpsum breakdown, confirmed
  it sums correctly into Added; confirmed Invested (gross) vs Valuation
  (actual entered value) differ correctly; confirmed XIRR is rolling by
  checking an earlier month's XIRR is unaffected by a later month being
  added (point-in-time); confirmed Safe SWP matches 4% of current value
  exactly; confirmed the negative-amount "i" button appears and its
  comment persists to the saved row; confirmed Grid view starts fully
  collapsed and toggles open/closed on tile click; confirmed the wealth
  chart renders with no TradingView attribution logo. 317/317 tests
  pass (30 new), build clean.

## Mutual Funds: Self/Wife/Son/Daughter family-member tree, 2026-11-25

- Requested directly: a tree hierarchy in the sidebar under Mutual
  Funds, putting the existing data under "Self" and allowing entries
  for other family members. Clarified two things first: this is
  Mutual Funds only (not NPS, a separate exact clone built earlier
  today - untouched by this), and adding members is fully open - no
  preset Wife/Son/Daughter names, the user types whatever they want.
- New `mutual_fund_profiles` table (migration 0009): id, user_id, name.
  `mutual_fund_entries` gets a `profile_id` FK, and the old
  `unique (user_id, month)` constraint becomes
  `unique (user_id, profile_id, month)` - the same calendar month can
  now have one entry per profile, not just one per user. Every existing
  user's real entries are backfilled to a "Self" profile created for
  them - nothing dropped or orphaned.
- Sidebar: "Mutual Funds" is now a non-navigating expandable parent row
  (click toggles open/closed, auto-expands when already on a Mutual
  Funds page); its children are real links to
  `/mutual-funds?profile=<id>`, one per profile, plus a "+ Add" row
  that reveals an inline name field - submitting creates the profile
  and navigates straight to it. The active profile gets the same
  gold-wash highlight as any other active nav item. Every link kept
  `prefetch={false}` (DECISIONS.md's earlier Sidebar performance fix).
- `app/(app)/mutual-funds/page.tsx` resolves the active profile from
  `?profile=`, falling back to (and auto-creating, on a brand first
  visit) the user's "Self" profile. The page header shows which
  profile you're viewing once there's more than one.
- Caught and fixed a real bug while verifying live: the shared layout
  fetches the profile list for the sidebar independently of (in
  parallel with) the page's own "ensure Self exists" call - on a truly
  first-ever visit (no profiles yet at all), the sidebar tree could
  render with no "Self" link until the next navigation. Fixed with a
  `listMutualFundProfilesEnsuringSelf` that ensures-then-lists, so the
  very first page load is never missing "Self".
- Verified live (not just by re-reading code): seeded Self with a Jan
  2026 entry, added a new "Wife" profile via the sidebar's "+ Add",
  confirmed Wife starts as a clean "No entries yet" with NO visibility
  into Self's Jan 2026 data; added a Feb 2026 entry under Wife and
  confirmed Self's own view shows Jan 2026 only, never Wife's Feb 2026
  - checked via each profile's actually-rendered visible text, in both
  directions. Confirmed the first-visit fix directly: a brand-new
  store's very first `/mutual-funds` load now shows "Self" in the
  sidebar immediately, no reload needed. 327/327 tests pass (10 new),
  build clean, screenshots taken desktop and mobile.

## New "My Long Term Holding" sidebar category wrapping NPS + Mutual Funds, 2026-11-25

- Requested directly: a renameable, collapsible category in the
  sidebar grouping NPS and Mutual Funds together.
- New per-user setting `nav_long_term_label` (migration 0010, default
  "My Long Term Holding") - a pure cosmetic nav label, not tied to
  either feature's own data. Renamed via a small pencil icon next to
  the category header: click it, type a new name, Enter or click away
  to save (POSTs to `/api/settings/nav-long-term-label`).
  Optimistically updates, then confirms via the server.
- Sidebar structure: "My Long Term Holding" is now a non-navigating
  expandable parent (same toggle pattern as "Mutual Funds" itself),
  auto-expanding when the current page is `/nps` or `/mutual-funds`.
  Its children are the NPS link and the existing Mutual Funds tree
  (Self/Wife/etc.) nested one level deeper - so there are now two
  levels of nesting when you're actually on a Mutual Funds page.
  Visiting NPS expands the category but leaves the Mutual Funds
  sub-tree collapsed (it only auto-expands on its own pages) - you see
  both category members without needing to see Self/Wife/etc. while
  looking at NPS.
- New `LongTermHoldingIcon` and `PencilIcon` in `components/icons.tsx`,
  matching the existing inline-SVG style exactly.
- Verified live: category defaults to "My Long Term Holding" with NPS
  and Mutual Funds nested under it; renamed it to "Retirement Corpus"
  via the pencil icon and confirmed the new name survives a page
  reload (persisted server-side, not just client state); confirmed the
  tree auto-expands correctly on both `/nps` and `/mutual-funds`.
  331/331 tests pass (4 new), build clean, screenshots taken desktop
  and mobile.

## Sidebar correction: flat "Investment" section, not a collapsible category, 2026-11-26

- The user flagged the previous "My Long Term Holding" collapsible
  category (chevron, rename, nesting) as "not what i wanted... like
  hierarchy" and attached a hand-drawn sketch: a plain section label
  ("Investment") sandwiched between two divider lines, with "mutual
  fund" and "NPS" listed flatly underneath - no further indentation, no
  expand/collapse arrow on the label itself.
- Clarified one open question the sketch didn't resolve either way:
  whether "Mutual fund" should also become a flat link (moving the
  Self/Wife/Son/Daughter switcher into the page itself). Confirmed:
  keep Mutual Funds expandable in the sidebar exactly as it already
  works - only the OUTER wrapper was the problem, not that one.
- Replaced `LongTermHoldingCategory` (collapsible, click-to-toggle)
  with `InvestmentSectionLabel`: a plain, non-clickable heading between
  two `border-t` rules, still renameable via the same small pencil icon
  and the same `nav_long_term_label` setting - just no longer a tree
  node. "Mutual Funds" (still its own expandable tree) and "NPS" (a
  flat link) now sit as ordinary siblings in the nav list, not nested
  inside anything.
- Changed the setting's default text from "My Long Term Holding" to
  "Investment" (matching the sketch) - migration 0011 updates the
  column default and any row still on the old default, additive rather
  than editing the already-pushed 0010.
- Verified live against the sketch directly: Journal, divider,
  "INVESTMENT" (with pencil), divider, "Mutual Funds" (still expands to
  Self / + Add on click), "NPS" - confirmed on desktop and mobile.
  331/331 tests pass, build clean.

## Mutual Funds: Rolling CAGR (1Y/3Y/5Y), 2026-11-26

- One of six "make Mutual Funds more powerful" ideas the user approved
  ("Build all") - this entry covers Rolling CAGR only; the other
  approved items are tracked and shipped separately.
- Three new trailing-period return figures per row - `cagr1y`,
  `cagr3y`, `cagr5y` - alongside the existing since-inception XIRR.
  Deliberately NOT a naive slice of the last N years' contribution
  flows: that would make money already sitting in the portfolio before
  the window invisible to the calculation, even though it kept
  compounding right alongside everything else. Instead, for a row at
  month M and a window of N years: find the entry for EXACTLY month
  (M − N years) - if there isn't one (a gap, or less than N years of
  history), the figure is `null`, same "never approximate to whatever
  entry happens to be close" convention `vsLastMonth`/`vsLastYear`
  already use via `shiftMonth` + an exact-month map lookup. That
  month's own `current_value` becomes a single starting outflow, as if
  a lump sum equal to the portfolio's value back then were invested on
  that date. Every contribution/withdrawal flow strictly after that
  month through month M is added on top, and month M's own
  `current_value` is the terminal inflow (same day as the last
  contribution flow, matching the since-inception XIRR's own
  convention). Solved via the existing `computeXirr` (`lib/xirr.ts`) -
  no second solver.
- New exported pure helper: `computeTrailingCagr(entries, targetMonth,
  years)` in `lib/mutual-fund-stats.ts`. Unit tests cover: a clean
  lump-sum-plus-growth case (hand-verifiable exactly 10%, same shape as
  the existing "exactly 10% XIRR" test); the null case when there's no
  entry exactly N years back; and a constructed scenario proving this
  is NOT naive flow-slicing - a 500000 lump sum already in the
  portfolio a year before the target, plus 12 months of a 10000 SIP on
  top, ending at a value reflecting ~0% real gain. The correct,
  lump-sum-anchored calculation reports a sane ~0% return; a
  deliberately naive slice that only sees the window's own 120000 of
  contributions against the same terminal value reports a wildly
  overstated 100%+ "return" - the test asserts the correct figure stays
  sane and the two disagree by over 100 percentage points.
- Surfaced as a single compact "CAGR (1Y/3Y/5Y)" column in the YearRows
  table (shared by both List and Grid views), immediately after XIRR -
  three stacked figures per cell, each green/red by sign or "—" when
  null, with a tooltip explaining the null case. `colSpan` on the
  inline edit-row bumped from 13 to 14 for the new column.
- Judgment calls: (1) combined the three figures into one column rather
  than three separate ones, to avoid growing the already-wide table
  further; column count work was identical either way for `colSpan`
  purposes. (2) `computeTrailingCagr` takes the raw entries array and
  does its own sort/month-map lookup internally (rather than reusing
  the view-builder's already-sorted array and map) so it stays a
  small, independently testable pure function with the exact shape of
  precedent used elsewhere in this file - it's called 3x per row,
  acceptable for a personal tracker's scale (at most a few hundred
  months), not worth optimizing further.
- Verified live: seeded 11 consecutive months from a fresh dev server -
  every row's 1Y figure correctly stayed "—" (not enough history).
  Added a 12th month exactly 12 calendar months after the first -
  confirmed its 1Y figure populated correctly (+21.6% for the seeded
  growth numbers) while 3Y/5Y stayed "—" (correctly still insufficient
  history for those windows). Screenshot taken. 336/336 tests pass (8
  new), `tsc`/`eslint` clean, build clean.

## Mutual Funds: goal tracking (target corpus + progress + projected time-to-goal), 2026-11-26

- Another of the six approved "make Mutual Funds more powerful"
  ideas ("Build all") - this entry covers goal tracking only, shipped
  as its own commit separate from Rolling CAGR.
- New nullable `goal_amount numeric` column on `mutual_fund_profiles`
  (migration 0012 - checked the migrations folder first; 0011 was the
  highest already applied). Per-profile, not per-user: "Self" and
  "Wife" can each aim for a different target corpus. New setter
  `setMutualFundProfileGoal(userId, profileId, goalAmount)` in
  `lib/db/mutual-fund-profiles.ts`, mirroring
  `createMutualFundProfile`'s Supabase-vs-local-store branching exactly,
  and a small JSON POST route,
  `app/api/mutual-fund-profiles/[id]/goal/route.ts`, mirroring
  `app/api/settings/nav-long-term-label/route.ts`'s shape (session
  check, validate, call setter, return the updated row).
  `goal_amount: null` means "no goal set yet" - a real, distinct state
  from "goal is zero."
- Progress and a projected time-to-goal are shown in the Overview the
  moment a profile has a goal set. The projection is deliberately the
  most conservative one that doesn't require guessing anything about
  the future: it assumes the portfolio's own latest since-inception
  XIRR holds steady, and makes NO assumption about future
  contributions continuing - if the user keeps contributing, the real
  time-to-goal will only be shorter than this. Formula (also written
  into a code comment above `computeGoalProjection` in
  `lib/mutual-fund-stats.ts`, matching the Safe SWP comment's rigor):
  convert the annualized XIRR to an equivalent monthly compounding
  rate, `monthlyRate = (1 + xirrPct/100)^(1/12) - 1`, then solve
  `currentValue * (1 + monthlyRate)^months = goalAmount` for `months`:
  `months = ln(goalAmount / currentValue) / ln(1 + monthlyRate)`.
  Every case that isn't a clean forward-looking projection gets its
  own explicit state instead of a guessed number (same "never
  approximate" philosophy as the CAGR figures and
  `vsLastMonth`/`vsLastYear`): already past the goal ("Goal reached."),
  no since-inception XIRR yet ("Not enough history yet..."), or a
  zero/negative monthly rate implied by the XIRR ("doesn't project
  forward growth..."). Unit-tested directly, including a
  hand-verifiable case constructed so the expected answer is exactly
  70 months by the closed-form formula's own construction (a monthly
  rate of exactly 1%, run for exactly 70 months).
  - When no goal is set, the Overview shows an inline "Set a target
    corpus" input + Save button directly - no separate Settings
    round-trip. Once set, it shows a progress bar (gold, turning green
    at 100%+), the progress percentage, the projected timeline text,
    and a small "Edit" link that reopens the same inline input
    pre-filled with the current goal.
- Judgment calls: (1) the goal-amount API route rejects 0 and negative
  values as invalid (a goal must be a positive target) but allows
  clearing it back to `null` via a separate code path
  (`goal_amount: null` in the request body) - the user never asked
  about 0/negative, but a zero or negative "target corpus" isn't a
  sensible goal to project against. (2) No separate "Clear goal"
  button was added in the UI - "Edit" reopens the input, and the user
  can set a new value; a dedicated clear button was left out as
  unnecessary surface area, since nothing in the brief asked for one
  and the API already supports it for a future UI pass if wanted.
  (3) `MutualFundDashboard.tsx` became a client component
  (`"use client"`) to support the inline save/edit interaction -
  consistent with `WealthGrowthChartLazy`, already a client component
  nested in the same tree.
- Verified live: confirmed the empty "Set a target corpus" state with
  no goal set; set a goal of ₹5,00,000 with only one month of history
  (no XIRR yet) and confirmed "Not enough history yet to project a
  timeline."; added a second month a year later (50% growth, so XIRR
  +50%) and confirmed progress showed exactly 30.0% (₹1,50,000 /
  ₹5,00,000) with a sane projected timeline; edited the goal down to
  ₹1,00,000 (already below current value) and confirmed "Goal
  reached."; cleared the goal via the API and confirmed the page
  returns to the empty "Set a target corpus" state. Screenshots taken.
  344/344 tests pass (9 new), `tsc`/`eslint` clean, build clean.

**Migration to run in Supabase's SQL editor:**

```sql
alter table public.mutual_fund_profiles
  add column if not exists goal_amount numeric;
```

## 2026-11-26: Benchmark overlay on the Mutual Funds wealth growth chart

- Added a third, dashed-blue line to the Overview's wealth growth chart
  (`components/mutual-funds/WealthGrowthChart.tsx`) showing how the
  exact same monthly cash flows would have grown in the Nifty 50
  instead - an apples-to-apples "did I beat the index" comparison, not
  a naive ratio-scale of invested amounts.
- Methodology (`computeBenchmarkSeries`, `lib/mutual-fund-stats.ts`):
  each month's net flow (`amount_added - withdrawal`, same sign
  convention as `cumulativeInvested`) "buys" `netFlow / indexLevel`
  benchmark units at that month's index level; the running unit holding
  is valued at each month's own level. A month outside the index
  table's coverage is simply omitted (null) rather than approximated -
  and once a month with a real (non-zero) flow falls outside coverage,
  every later month is null too, since the running unit count can no
  longer be a faithful simulation from that point on.
- Benchmark data source (`lib/benchmark-index-data.ts`): this app has
  no live market-data provider wired for mutual funds at all (it's a
  private, manual-entry tracker), so adding one just for a comparison
  line wasn't justified. Instead, a static monthly Nifty 50 level table
  (2014-12 through 2026-11) was built from a small set of anchor points
  sourced via WebSearch - year-end closes for 2015-2023 cross-checked
  against a public historical-close table, 2024/2025 levels from
  (unverified) recall, and three real 2026 closing levels found live -
  with every month between anchors **linearly interpolated**. This is
  explicitly approximate and documented as such in the file: it's a
  visual comparison, not a financial-grade feed, so a real month's
  volatility (a dip and recovery) will look smoother here than it
  actually was. If real precision is ever needed, this table should be
  replaced with an actual NSE/vendor download.
- Judgment calls: (1) the overlay is a static always-on third line
  (not toggle-able) - simpler, and the chart already has 3 distinct
  colors/styles (solid gold, solid gray, dashed blue) plus an updated
  legend line underneath it; a toggle can be added later if the line
  gets in the way. (2) `computeBenchmarkSeries` takes an injectable
  `lookupLevel` function (defaulting to the real table) specifically so
  tests can hand-verify the unit-purchase math against simple, round
  index levels instead of the real table's irregular values.
- Verified live: seeded 3 months of entries (Sep-Nov 2025, ₹10,000/mo,
  ending at ₹31,200), confirmed the chart renders 3 lines with the
  updated legend text, confirmed the dashed blue line tracks sensibly
  close to the gold line (both the real portfolio and the index were
  roughly flat over that window), then deleted the seeded entries.
  348/348 tests pass (15 new), `tsc`/`eslint` clean, `npm run build`
  clean. No DB migration needed (purely derived/static data).

## 2026-11-26: CSV import/export for Mutual Fund entries

- "Export CSV" (next to "+ Add entry") downloads the active profile's
  full entry history - one row per month, oldest first, columns
  matching the entry form plus the derived `amount_added` (never typed
  directly, same convention as everywhere else in this feature).
- "Import CSV" accepts a file in the same shape and bulk-creates
  entries for the active profile. A month that already has an entry is
  always **skipped, never overwritten** - re-importing the same export
  twice is a safe no-op, not a way to accidentally lose edits made
  since. The result summary reports exactly what happened: N created,
  which months were skipped (already existed) and why any row was
  rejected (bad month, unparseable number, negative withdrawal, etc.).
- A month appearing more than once **within the uploaded file** rejects
  the whole import up front (400, listing the duplicate months) rather
  than silently picking one occurrence - picking one would be
  discarding data with no way for the user to know which one won.
- The parsing/validation itself (`lib/mutual-fund-csv.ts`,
  `parseMutualFundCsv`) is a pure function with no I/O, so it's
  unit-tested directly; the new API route
  (`app/api/mutual-fund-entries/import/route.ts`) only wires it to the
  existing profile-ownership check and `upsertMutualFundEntry`.
  `amount_added` is recomputed from the breakdown columns exactly like
  `POST /api/mutual-funds` already does (never trusted from the file
  directly) - the file's own `amount_added` cell is only used as a
  fallback when none of sip/lumpsum/stp/other has a value, matching the
  "never classified" convention for pre-breakdown entries.
- A general-purpose quoted-CSV reader (`parseCsv`, handles embedded
  commas/quotes/newlines) was added to the existing `lib/csv.ts`
  alongside its pre-existing `parseTickerCsv`/`toCsv` (left untouched
  and reused for export, rather than writing a second CSV writer).
- Verified live: exported a seeded entry and confirmed the CSV's exact
  column/row shape; imported a 3-row file (1 new month -> created, 1
  month that already existed -> skipped and named, 1 row with an
  invalid current_value -> rejected and named with a reason) and
  confirmed the result summary and the page's entry list matched
  exactly; separately confirmed a file with the same month twice is
  rejected outright, naming the duplicate, with nothing imported.
  371/371 tests pass (29 new across `lib/csv.ts` and
  `lib/mutual-fund-csv.ts`), `tsc`/`eslint` clean, `npm run build`
  clean. No DB migration needed.

## 2026-11-26: Combined "Net Worth" view (Mutual Funds + NPS)

- New read-only page at `/net-worth` (`lib/net-worth-stats.ts`,
  `components/net-worth/NetWorthDashboard.tsx`): a consolidated Current
  value / Total invested / Overall gain / Combined XIRR across every
  Mutual Fund profile (every family member) plus NPS, a combined wealth
  growth chart, and a per-entity breakdown table. Pure aggregation of
  data the Mutual Funds and NPS trackers already compute - no new DB
  tables, no new entry forms.
- **Pooled XIRR, not an average of the individual XIRRs**: every
  entity's own contribution/withdrawal flows (at their own dates) go
  into one combined flow list, plus a single combined terminal flow -
  dated at the latest month ANY entity has an entry for, valued at the
  sum of every entity's own latest known `current_value` as of that
  month (forward-filled for an entity that hasn't been updated as
  recently - it still holds that value). `computeXirr` then solves one
  rate for the whole pooled set. Averaging each entity's own XIRR would
  have been wrong - it ignores how much capital and timing each stream
  actually represents (verified by a hand-built test: a 100%-return
  profile with 100k mixed with a flat 0%-return profile with 900k pools
  to exactly 10%, the capital-weighted truth, not the naive 50%
  average).
- **Combined wealth chart forward-fills, never zero-fills**: the chart
  is the union of every entity's months; for a month where one entity
  has no entry yet, that entity's last known invested/value carries
  forward rather than dropping to 0 (a profile that simply hasn't been
  updated this month still holds its prior value).
- Reused `WealthGrowthChartLazy` (the benchmark-overlay chart) rather
  than building a second chart component - the benchmark line is always
  passed `null` here (no single "Nifty equivalent" makes sense for a
  pooled, cross-entity series), which the existing component already
  renders as simply no blue line.
- `NetWorthDashboard` is a plain Server Component (no `"use client"`) -
  unlike `MutualFundDashboard`, this page has no inline interactive
  input, so it can render the client-boundary chart directly the same
  way the original pre-Goal-tracking design did.
- Nav: "Net Worth" placed as the first item under the "Investment"
  section label, above Mutual Funds and NPS (a summary of both, so it
  reads first).
- `lib/net-worth-stats.ts` depends on the *shape* `MutualFundDashboard`/
  `NpsDashboard`/their row views already share (both are structurally
  identical), not either concrete type - keeps this module decoupled
  from which tracker an entity actually came from.
- Verified live: seeded Self (Jan 1L in/1L value, Jun 0 in/1.05L value),
  Wife (Jan 50k in/48k value, no second month), NPS (Jan 20k in/20k
  value, May 0 in/21k value). Hand-checked every figure against the
  screen: combined current value 1,74,000 and invested 1,70,000 (exact
  sums), combined XIRR +5.7% (verified by hand: pooled flows -1,70,000
  at day 0 vs. +1,74,000 at day 152 solves to 5.75-5.8%, matching
  displayed); Self's own +12.4%, NPS's own +15.9%, and Wife's `—` (only
  one month, nothing to solve a rate from) all independently hand-
  verified against the XIRR formula and matched exactly. Forward-fill
  confirmed in the same run: Wife's and NPS's earlier values visibly
  carried through May/Jun in the combined chart rather than disappearing.
  380/380 tests pass (9 new in `lib/net-worth-stats.test.ts`),
  `tsc`/`eslint` clean, `npm run build` clean. No DB migration needed.
  Dev server and seeded local-store data cleaned up after verification.
