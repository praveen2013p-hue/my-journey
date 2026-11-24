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
  later is flipping env vars, not a rewrite. The local store file lives at
  `data/dev-store.json` and is git-ignored (never commit real trade data).
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
