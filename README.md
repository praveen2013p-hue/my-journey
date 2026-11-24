# My Journey

A private swing-trading workspace for Praveen and his wife — built from
`BRIEF.md`. This README is written for Praveen, not assuming you write code.

## What's built so far (Phase 1)

- Sign-in restricted to two Google accounts (allow-listed by email)
- A webhook that receives your TradingView alerts and stores them
- Breakouts and Pullbacks pages: filter by week, date range, market, grade,
  sector, industry; live/last prices; a detail panel per stock with a
  weekly chart, your own notes, and fundamentals when the alert includes them
- The "New since last visit" banner and badges
- A Settings page showing alert health and any ticker that needs a manual
  symbol mapping
- A login page, sidebar, dark/light theme — matching your `design/` reference

Full list of what's deferred to Phase 2/3, and every default I picked
instead of stopping to ask, is in `DECISIONS.md`.

## Running it right now, with no setup

The app works today with **no Supabase project and no real Google
sign-in** — it falls back to a local file for storage and a "pick your
account" button instead of "Continue with Google" (see `DECISIONS.md`).
This is only for Phase 1, while you don't yet have a Supabase project.

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and set just these two lines (anything else can stay
blank for now):

```
ALLOWED_EMAILS=you@gmail.com,yourwife@gmail.com
WEBHOOK_SECRET=pick-any-long-random-text
MOCK_AUTH_SECRET=pick-any-other-long-random-text
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000> — you'll land on the login page and can pick
one of your two emails to "sign in." Try it from your phone's browser on
the same Wi-Fi too (BRIEF.md asked for mobile-friendly).

### Try the webhook with sample data

In a second terminal, with the dev server still running:

```bash
WEBHOOK_SECRET=pick-any-long-random-text node scripts/seed-sample-alerts.mjs
```

(Use the exact same value you put in `.env.local`.) This posts a handful
of sample alerts — open **Breakouts** and **Pullbacks** in the app to see
them appear, filter by week, and open a stock's detail panel.

You can also post your own, by hand, exactly like TradingView will:

```bash
curl -X POST http://localhost:3000/api/webhooks/tradingview \
  -H "Content-Type: text/plain" \
  --data-raw '{"secret":"pick-any-long-random-text","type":"stage2","ticker":"SBIN","exchange":"NSE","price":"812.5","open":"790.1","high":"818.9","low":"788.0","volume":"54231000","interval":"W","time":"2026-11-20 15:45","signal":"Weinstein Stage 2 breakout","grade":"A","breakoutLevel":"801.4","volRatio":"2.31","rs":"4.7","pctAboveMA":"9.8","overheadPct":"0","sector":"Finance","industry":"Regional Banks"}'
```

### Running the tests

```bash
npm test
```

70+ tests cover the Weinstein stage/RS math, the Quality Score, and the
webhook (secret check, a repeated alert updating in place rather than
duplicating, rate-limiting only wrong-secret requests, partial sector
snapshots).

## What each environment variable is, and how to get it

Copy `.env.example` to `.env.local` and fill these in as you get them —
nothing requires all of them at once.

| Variable | What it's for | How to get it |
|---|---|---|
| `ALLOWED_EMAILS` | The only two Google accounts allowed in | Just type them, comma-separated |
| `WEBHOOK_SECRET` | TradingView proves it's really your alert | Make up any long random string yourself (don't reuse the old Google-Sheet one) |
| `MOCK_AUTH_SECRET` | Phase 1 only — signs the temporary login cookie | Make up any long random string |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Your database | See "Setting up Supabase" below |
| `KITE_API_KEY`, `KITE_API_SECRET` | Zerodha India market data (never places orders) | See "Setting up Zerodha Kite Connect" below |
| `TOKEN_ENC_KEY` | Encrypts your Kite login token at rest | Make up any 32+ character random string |
| `CRON_SECRET` | Protects the nightly backup job from being triggered by strangers | Make up any long random string |
| `BLOB_READ_WRITE_TOKEN` | Where nightly backups are stored | Vercel gives you this automatically once you add Blob storage to your project |
| `FORCE_MOCK_US` | Optional: set to `true` to force fake US prices instead of real Yahoo ones (handy for an offline demo) | Your choice |

### Setting up Supabase (when you're ready)

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project**. Name it `my-journey`, set a database password
   (save it somewhere safe), pick a region close to India, Free plan.
3. Wait about 2 minutes for it to finish setting up.
4. Go to **Project Settings → API**. Copy the **Project URL** into
   `NEXT_PUBLIC_SUPABASE_URL`, the **anon public** key into
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the **service_role** key into
   `SUPABASE_SERVICE_ROLE_KEY` (treat this one like a password).
5. Go to the **SQL Editor**, paste in the contents of
   `supabase/migrations/0001_init.sql`, and run it. This creates every
   table.
6. Tell me once this is done — I'll then wire up real Google sign-in
   through Supabase (replacing the Phase 1 "pick your account" button) and
   remove the mock-login code.

### Setting up Google OAuth (for real sign-in, after Supabase exists)

1. In your Supabase project, go to **Authentication → Providers → Google**
   and turn it on.
2. In the [Google Cloud Console](https://console.cloud.google.com/), create
   an OAuth client (Web application). Add your site's URL (the Vercel link)
   and Supabase's callback URL (shown on that same Supabase page) as
   authorized redirect URIs.
3. Paste the Google **Client ID** and **Client Secret** into that same
   Supabase provider screen.

### Setting up Zerodha Kite Connect (India live data)

Only needed once you're ready to pay for the ₹500/month plan — the app
runs on mock India prices until then.

1. Go to [developers.kite.trade](https://developers.kite.trade/) and
   create an app. Set the redirect URL to
   `https://<your-site>/api/zerodha/callback`.
2. Copy the **API key** and **API secret** into `KITE_API_KEY` /
   `KITE_API_SECRET`.
3. In the app's Settings page (once built further), click **Connect
   Zerodha** and log in with your Kite credentials — the app never sees or
   stores your password, only a token that expires daily.

### Deploying to Vercel

1. Push this repo to GitHub (you already own GitHub/Vercel accounts per
   BRIEF.md).
2. In Vercel, **New Project**, import the repo.
3. Paste in every `.env.local` value as a Vercel **Environment Variable**
   (same names).
4. Deploy. Use the resulting `https://....vercel.app` URL as your site's
   final URL for the Google OAuth and Kite redirect settings above, and as
   the webhook URL in your TradingView alerts
   (`https://<your-site>/api/webhooks/tradingview`).

## Data terms (please read before connecting real accounts)

- **Zerodha Kite** data is licensed for your own personal use. Check
  Zerodha's current data-sharing terms before using it beyond your own
  household (BRIEF.md §10).
- **Yahoo Finance** data via `yahoo-finance2` is free but unofficial and
  delayed ~15 minutes — also personal/household use only (BRIEF.md §17.7).
- This app never places orders with any broker. Kite is used for market
  data only.

## Project layout

```
app/              Next.js pages and API routes
components/       React components (sidebar, tables, side panel, charts)
lib/              Business logic: Weinstein calculations, Quality Score,
                  webhook processing, the db layer, market data providers
lib/db/           Repository functions (branch: real Supabase vs local store)
supabase/migrations/   The real Postgres schema + RLS, ready for when
                        Supabase exists (see "Setting up Supabase" above)
design/           Your 5 reference screens (visual source of truth)
scripts/          seed-sample-alerts.mjs - post sample data for testing
DECISIONS.md      Every default I picked that BRIEF.md didn't settle
```
