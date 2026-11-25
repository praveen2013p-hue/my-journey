# My Journey

A private swing-trading workspace for Praveen and his wife — built from
`BRIEF.md`. This README is written for Praveen, not assuming you write code.

## What's built (Phases 1, 2 and 3 - everything in BRIEF.md)

- Sign-in restricted to two Google accounts (allow-listed by email)
- A webhook that receives your TradingView alerts (stock alerts and the
  weekly sector-board snapshot) and stores them
- Breakouts and Pullbacks pages: filter by week, date range, market, grade,
  sector, industry; live/last prices; a detail panel per stock with a
  weekly chart, your own notes, and fundamentals when the alert includes them
- Sectors page: ranked table (Stage, Mansfield RS, 4/13/26/52-week RS
  change, traded value, 1-week deltas), focus-star rule, India/US toggle
- Dashboard: this week's triggers, top focus sectors, market regime light,
  open trades and P&L (India and US always kept separate)
- Journal: log buy/sell trades, strategy tags, win rate/expectancy/
  per-strategy results, open and closed tabs
- Weekly Review: an auto-generated summary of each week (triggers, focus
  sector changes, trades, win rate) plus your own free-text reflection
- Performance: time-frame and market filters, trade stats (win rate,
  profit factor, max drawdown, equity curve...), "if I had held" vs. your
  actual exits, and how every triggered stock performed whether you bought
  it or not
- Settings: alert health, symbol mapping, sector constituents upload,
  login-page quotes manager, strategy tags manager, Zerodha connection
  status, and CSV/Excel downloads of your alerts, trades and sector data
- The "New since last visit" banner and badges, data-freshness strip,
  market-regime red banner
- A login page, sidebar, dark/light theme — matching your `design/` reference

Every default I picked instead of stopping to ask - and every place a
real account (Supabase, Zerodha) is still needed before something becomes
fully real instead of mock data - is written down in `DECISIONS.md`.

## Running it right now, with no setup

The app works today with **no Supabase project and no real Google
sign-in** — it falls back to a local file for storage and a "pick your
account" button instead of "Continue with Google" (see `DECISIONS.md`).
This is fine for trying it out, but on a Vercel deployment without
Supabase that local file isn't reliable storage (more on this under
"Setting up Supabase" below) - it's there so you can look around and try
every page before Supabase exists.

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

120+ tests cover the Weinstein stage/RS math, the Quality Score, the
webhook (secret check, a repeated alert updating in place rather than
duplicating, rate-limiting only wrong-secret requests, partial sector
snapshots), and the Journal/Performance trade math (win rate, expectancy,
profit factor, max drawdown).

### TradingView alert message format

Point your TradingView alerts' webhook URL at
`https://<your-site>/api/webhooks/tradingview`, with the alert message set
to one of these three JSON shapes (every numeric value as a **string** -
TradingView sends alert messages as plain text, and the site parses them):

**Stock alert** (breakout or pullback):

```json
{
  "secret": "your-webhook-secret",
  "type": "stage2",
  "ticker": "SBIN",
  "exchange": "NSE",
  "price": "812.5",
  "open": "790.1",
  "high": "818.9",
  "low": "788.0",
  "volume": "54231000",
  "interval": "W",
  "time": "2026-11-20 15:45",
  "signal": "Weinstein Stage 2 breakout",
  "grade": "A",
  "breakoutLevel": "801.4",
  "volRatio": "2.31",
  "rs": "4.7",
  "pctAboveMA": "9.8",
  "overheadPct": "0",
  "sector": "Finance",
  "industry": "Regional Banks"
}
```

Use `"signal": "Pullback"` (instead of "Weinstein Stage 2 breakout") for a
pullback alert on the same ticker.

**Fundamentals** (optional - add these same fields to a stock alert above,
or send as a follow-up alert for the same ticker/week; all nullable):
`marketCap`, `pe`, `epsTtm`, `epsGrowthYoY`, `epsGrowthQoQ`,
`salesGrowthYoY`, `salesGrowthQoQ`, `roe`, `roce`, `debtToEquity`,
`nextEarningsDate`.

**Weekly sector-board snapshot** (one alert per sector/industry, or a
batched array - a partial batch is accepted and shows "Partial snapshot: n
of m sectors" rather than failing):

```json
{
  "secret": "your-webhook-secret",
  "type": "sectorBoard",
  "market": "IN",
  "week": "2026-11-16",
  "rows": [
    { "rank": 1, "sector": "Bank", "stage": 2, "rs": 6.1, "rsUp": true, "vsMA": 8.4, "chg4": 1.2, "focus": true }
  ]
}
```

`week` is the Monday the bar opened on; the site works out `week_ending`
(that Friday) itself. The site always recomputes its own focus-star rule
from Stage/RS/Δ4/Δ13 rather than trusting a sector row's own `focus`
field (see `DECISIONS.md`).

**If your Pine script builds the alert message itself** (so there's no
room to add a `"secret"` field without editing a live indicator you don't
want to touch - e.g. one still feeding your Google Sheet), put the secret
in the webhook URL instead and leave the message exactly as it is:

```
https://<your-site>/api/webhooks/tradingview?secret=your-webhook-secret
```

A `secret` inside the message always wins if present; the URL is only a
fallback for when the message has none.

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
   through Supabase (replacing the "pick your account" button) and remove
   the mock-login code. This is also when data finally persists reliably
   on a Vercel deployment - without Supabase, the local-file store lives
   in `/tmp` on Vercel, which is wiped on every cold start and isn't
   shared between concurrent requests (see `DECISIONS.md`).

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

Live and working once you've done this once:

1. Go to [developers.kite.trade](https://developers.kite.trade/), pay for
   the ₹500/month plan, and create an app. Set the redirect URL to
   `https://<your-site>/api/zerodha/callback`.
2. Copy the **API key** and **API secret** into `KITE_API_KEY` /
   `KITE_API_SECRET`.
3. On Settings, click **Connect Zerodha** (only the owner account - the
   first email in `ALLOWED_EMAILS` - sees this button) and log in with
   your Kite credentials. The app never sees or stores your password,
   only an access token, encrypted at rest (`TOKEN_ENC_KEY`).
4. Kite logs that token out every day (~6am IST) - Settings shows the
   exact expiry and a **Reconnect Zerodha** button once it's expired.
   This is expected daily maintenance, not a bug: pages never crash or
   block on it, they just show the last good price marked stale until
   you reconnect.

5. On Settings, under **2-year sector history backfill**, click
   **Backfill India sectors** / **Backfill US sectors** (owner-only) to
   load 2 years of weekly stage/RS history for every sector with a
   resolved index symbol (BRIEF.md §7.2) - safe to re-run any time, and it
   never overwrites a week your real TradingView alerts already sent.
   Only 4 of India's 28 sectors have a confirmed symbol today; the rest
   show up in the result and in "unresolved sector indices" below until
   you confirm a real one (see `DECISIONS.md`).

Not built yet even with Kite connected: the Saturday refresh/nightly
backup crons (§11) - separate, bigger pieces of infrastructure on their
own (see `DECISIONS.md`).

### Deploying to Vercel

Already live for you at the URL you've been testing on, deployed straight
from this repo's `master` branch. To redo this from scratch, or on a new
project:

1. Push this repo to GitHub (you already own GitHub/Vercel accounts per
   BRIEF.md).
2. In Vercel, **New Project**, import the repo.
3. Paste in every `.env.local` value as a Vercel **Environment Variable**
   (same names).
4. In the project's **Settings → Deployment Protection**, turn off
   "Vercel Authentication" - it's on by default for new projects and would
   make your wife sign in with a Vercel account just to reach the login
   page, which has nothing to do with this app's own two-email sign-in.
5. Deploy. Use the resulting `https://....vercel.app` URL as your site's
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
app/              Next.js pages (Dashboard, Breakouts, Pullbacks, Sectors,
                   Journal, Weekly Review, Performance, Settings) and API routes
app/api/export/    CSV/.xlsx download endpoints (Settings -> Data downloads)
components/        React components, one subfolder per page
lib/               Business logic: Weinstein calculations, Quality Score,
                   trade stats, webhook processing, market data providers
lib/db/            Repository functions (branch: real Supabase vs local store)
supabase/migrations/   The real Postgres schema + RLS, ready for when
                        Supabase exists (see "Setting up Supabase" above)
design/            Your 5 reference screens (visual source of truth)
scripts/           seed-sample-alerts.mjs - post sample data for testing
DECISIONS.md       Every default I picked that BRIEF.md didn't settle
```
