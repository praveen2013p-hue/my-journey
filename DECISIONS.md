# Decisions

Every choice this file records is one BRIEF.md didn't settle. Safest default
picked, noted here, then kept moving — per BRIEF.md's own instruction not to
stop and ask for these.

## Infra / environment

- **No Supabase project yet.** Praveen couldn't create one in this session.
  Phase 1 runs against a local JSON-file store (`lib/db/local-store.ts`) that
  mirrors the exact table/column shapes in `supabase/migrations/0001_init.sql`.
  Every repository function in `lib/db/*` checks `isSupabaseConfigured()`
  and calls the real Postgres query when Supabase env vars are present,
  otherwise falls back to the local store — so wiring in the real project
  later is flipping env vars, not a rewrite. The local store file lives
  under the OS temp directory (`os.tmpdir()`), not the project folder —
  deployed to Vercel without Supabase, the project bundle itself is
  read-only, and `/tmp` is the only writable path a serverless function
  gets. That also means data doesn't persist reliably on a Vercel
  deployment without Supabase: `/tmp` is wiped on every cold start and
  isn't shared between concurrent instances, so two people (or two
  requests) can see different data. Fine for "look around the pages";
  Supabase is the real fix once it exists.
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
