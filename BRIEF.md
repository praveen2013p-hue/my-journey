# BUILD BRIEF — "My Journey" (private swing-trading web app)

You are my senior full-stack engineer. Build the app below in **3 phases**. After each phase, stop, run the tests, give me a short demo/checklist, and wait for my "go" before starting the next phase. Keep a `DECISIONS.md` in the repo recording every choice you make that this brief doesn't settle. Where something is unclear, pick the safest default, note it in `DECISIONS.md`, and keep going; ask me only when a choice costs money or can't be undone.

I am Praveen. I trade weekly-close Weinstein Stage 2 setups in **India (NSE)** and the **US**. The app is for **me and my wife only** (two Google accounts).

---

## 1. What the app does (one paragraph)

TradingView fires weekly-close alerts (Weinstein Stage 2 breakouts and pullbacks, plus a weekly sector snapshot) to a webhook on this site. The site stores every alert with its trigger price and details, lets me log in with Google and filter triggered stocks by week or date range, shows each stock's live price and Weinstein stats, shows sector and industry context, ranks sectors by Stage / relative strength (RS) / money flow, tracks my trades by strategy tag, and shows a dashboard and weekly review.

## 2. Fixed decisions (do not re-ask)

| Area | Decision |
|---|---|
| Stack | Next.js (App Router, TypeScript) + Tailwind + Supabase (Postgres + Google Auth) + Vercel (Hobby is fine; I own Vercel and GitHub accounts) |
| Users | Exactly 2 Google accounts, allow-listed by env `ALLOWED_EMAILS` (comma-separated). Anyone else is signed out with "Access restricted". Mobile-friendly responsive layout; desktop-first design |
| Markets | India (NSE/BSE) and US (NYSE/NASDAQ/AMEX) |
| India data | **Zerodha Kite Connect** (₹500/month plan, live + historical included). **Data APIs only — never implement order placement.** I will buy the plan when needed; build and test with a mock provider first |
| US data | Yahoo Finance via `yahoo-finance2` (free, unofficial, ~15 min delayed — label it "Delayed"). Put every provider behind a `MarketDataProvider` interface so it can be swapped |
| Fundamentals | Come **inside the TradingView alert payload** (Section 5). Nullable. Do not call a separate fundamentals API |
| Old system | Alerts currently also go to a Google Sheet via Apps Script. Keep that untouched. The site runs in parallel; I retire the Sheet myself later |
| Name | "My Journey" — stored in a settings table, editable in Settings, used everywhere (title, sidebar, login) |
| Theme | Dark by default: charcoal + gold. Light theme via a toggle |
| Currency | India in ₹, US in $. **Never combine** India and US P&L; show separate totals |
| Timezone | Display all times in Asia/Kolkata (setting), store UTC |

## 3. Design system

- **Dark:** background `#16171A`, panel `#1E2024`, border `#2A2D33`, text `#E8E6E1`, muted `#9A9A9A`, **gold accent `#C9A24A`** (links, active nav, primary buttons, focus rings).
- **Light:** background `#FAF8F3`, panel `#FFFFFF`, border `#E6E1D6`, text `#1E1F22`, same gold accent.
- **Signal colors (never use gold for these):** green `#3DBE7A`, amber `#E8923A`, red `#E5534B`. Every colored cell also carries an icon or text (accessibility), never color alone.
- **Fonts:** Inter for UI with `font-variant-numeric: tabular-nums` on all numbers; a serif (Cormorant Garamond or similar) for quotes and the site name.
- Dense, terminal-like tables, generous spacing elsewhere, subtle 150 ms transitions, no gimmicks.

### Layout shell (after login)
- **Collapsible left sidebar** (icons + labels, collapses to icons): Dashboard, Breakouts, Pullbacks, Sectors, Journal, Weekly Review, Settings.
- Sidebar top: site name, then the **Market Regime light** (India and US dots). Sidebar bottom: theme toggle, user avatar/name, sign out.
- No separate top bar. A **red regime banner** (Section 8) appears at the top of the content area when needed.
- On mobile the sidebar becomes a slide-over drawer; tables scroll horizontally with the Ticker column sticky.

### Login page
- Full-screen **clean background** (soft charcoal gradient, no clutter) with a large, elegant **rotating quote** (serif) about life and mindset, centered-left, crossfading every ~12 s; a different quote on each page load.
- **The login card sits at the bottom-right** (fixed, ~380 px wide, 24 px margin): site name, short tagline, one button **"Continue with Google"**. Nothing else.
- Quotes: starter set of ~40 short lines — public-domain wisdom (Marcus Aurelius, Seneca, Epictetus, Lao Tzu, Thiruvalluvar and the Bhagavad Gita in **your own short paraphrases**, with attribution) plus **original** trading-mindset lines you write. Do not paste copyrighted quotes. The table is publicly readable (no secrets in it); I can add/remove my own quotes in Settings.

## 4. Data model (Supabase Postgres; RLS on every table)

Shared (read: any allow-listed user; write: server only):
- `alerts_raw` — every webhook body received (jsonb), timestamp, accepted bool, reason.
- `alerts` — one row per stock signal: `id, market ('IN'|'US'), exchange, ticker, signal_type ('breakout'|'pullback'), grade ('A'|'B'|'C'), week_ending date, triggered_at timestamptz, trigger_price, open, high, low, volume, breakout_level, vol_ratio, mrs, pct_above_ma, overhead_pct, sector, industry, fundamentals jsonb, ma30w, quality_score, quality_breakdown jsonb, raw jsonb, created_at`. **Unique** `(market, ticker, signal_type, week_ending)` — upsert, idempotent.
- `sector_snapshots` — `market, week_ending, sector, stage, mrs, rs_up, vs_ma, chg4, focus, source ('alert'|'backfill')`, unique `(market, week_ending, sector)`.
- `sector_metrics` — computed per `(market, week_ending, sector)`: `mrs, d4, d13, d26, d52` (RS change over 4/13/26/52 weeks), `traded_value, tv_avg10, tv_ratio, is_focus`.
- `sector_map` — `market, display_name, tv_symbol, provider_symbol, kind ('sector'|'industry')`.
- `sector_constituents` — `market, sector, ticker, updated_at`.
- `symbol_map` — TradingView ticker → provider symbol (Kite tradingsymbol / Yahoo symbol) with manual overrides and an "unmapped" status.
- `provider_session` — Zerodha access token (**encrypted at rest**), `expires_at`.
- `quotes` — login-page quotes (`text, author, owner_id nullable, active`).
- `backup_log`.

Per-user (RLS `user_id = auth.uid()`):
- `user_settings` (site name is global; theme, timezone, `last_seen_alerts_at`).
- `strategy_tags` (user-created, free text, unique per user).
- `trades` — `id, user_id, market, ticker, buy_date, quantity, buy_price, sell_date null, sell_price null, strategy_tag_id, alert_id null, created_at`.
- `stock_notes` — `user_id, market, ticker, note, updated_at`.
- `weekly_reflections` — `user_id, week_ending, text`.

My wife and I **share** alerts, sectors and market data, and each keep **separate** trades, tags, notes, reflections and "last seen".

## 5. Webhook contract (TradingView → site)

Endpoint: `POST /api/webhooks/tradingview`. TradingView may send `text/plain`, so read the raw body and `JSON.parse` it. Respond `200` fast (TradingView times out in ~3 s); do heavy work (quality score, MA lookup) after responding or in a background job.

- **Secret:** body field `secret` must equal env `WEBHOOK_SECRET` (use constant-time compare). Wrong or missing → log to `alerts_raw` as rejected, return `401`, never echo the secret. I will generate a **new** secret for the site (the old Sheet's secret must not be reused). Never log it.
- Basic rate limit and a body-size cap (~16 KB).
- All numeric values arrive as **strings**; parse them. Empty `sector` / `industry` are possible.
- `market`: exchange `NSE`/`BSE` → `IN`; `NYSE`/`NASDAQ`/`AMEX`/`CBOE` → `US`.
- `ticker` is TradingView's `syminfo.ticker` (examples: `SBIN`, `M&M`, `BAJAJ_AUTO`, `BRK.B`). Map to provider symbols via `symbol_map` (Kite uses `BAJAJ-AUTO`; Yahoo uses `BRK-B`). Unmapped tickers still save the alert; they show "price unavailable" and appear in a Settings → "Unmapped symbols" list where I can fix them.

### 5a. Stock alert (existing format, illustrative values)
```json
{"secret":"<WEBHOOK_SECRET>","type":"stage2","ticker":"SBIN","exchange":"NSE",
 "price":"812.5","open":"790.1","high":"818.9","low":"788.0","volume":"54231000",
 "interval":"W","time":"2026-11-20 15:45","signal":"Weinstein Stage 2 breakout",
 "alertName":"W-Stage2 breakout","grade":"A","breakoutLevel":"801.4","volRatio":"2.31",
 "rs":"4.7","pctAboveMA":"9.8","overheadPct":"0","sector":"Finance","industry":"Regional Banks"}
```
- `signal` is `"Weinstein Stage 2 breakout"` or `"Weinstein Stage 2 pullback"` → `signal_type`.
- `price` = weekly close at the trigger = **trigger price**. `time` is in Asia/Kolkata (for US stocks it arrives early Saturday IST).
- **week_ending rule:** convert `time` to the exchange's timezone (India: Asia/Kolkata, US: America/New_York); Mon–Fri → that week's Friday; Sat/Sun → the previous Friday.
- `avg_volume_4w = volume / volRatio` (derive and display; `volRatio` is volume ÷ prior-4-week average per the script).
- `pullback` alerts: `breakoutLevel` is the original breakout level; link to the latest earlier breakout alert of the same ticker (`weeks since breakout`, original grade).

### 5b. Optional fundamentals (added later by "-Site" copies of my Pine scripts; accept and store when present, all nullable)
`marketCap, pe, epsTtm, epsGrowthYoY, epsGrowthQoQ, salesGrowthYoY, salesGrowthQoQ, roe, roce, debtToEquity, nextEarningsDate` → stored in `alerts.fundamentals`. Never fail if absent.

### 5c. Sector board snapshot
```json
{"secret":"<WEBHOOK_SECRET>","type":"sectorBoard","week":"2026-11-16","sent":"2026-11-20 15:50",
 "bench":"NSE:CNX500","market":"IN","s1":3,"s2":9,"s3":8,"s4":8,
 "rows":[{"rank":1,"sector":"PSU Bank","stage":2,"rs":12.4,"rsUp":true,"vsMA":15.2,"chg4":6.1,"focus":true}]}
```
- `week` is the **Monday** (bar open) date → `week_ending = Monday + 4 days`.
- `market` defaults to `IN` if absent (the US board will send `"US"`).
- The existing India script currently sends **no secret** on this message; the "-Site" copy will add it. Reject snapshots without a valid secret.
- The India board covers 28 sector indices: Bank, PSU Bank, Private Bank, Financial Svcs, Capital Markets, IT, Auto, EV & New Auto, Pharma, Healthcare, FMCG, Consumption, Cons Durables, Metal, Commodities, Chemicals, Energy, Oil & Gas, Realty, Housing, Infrastructure, Manufacturing, Defence, Railways PSU, PSE (PSU cos), Media, Digital, Tourism (TradingView symbols like `NSE:BANKNIFTY`, `NSE:CNXPSUBANK`, `NSE:CNXIT`, `NSE:NIFTY_IND_DEFENCE`). Seed `sector_map` with these; resolve the Kite index instrument names at runtime from the instruments dump; list unresolved ones in Settings.
- **Benchmark note:** stock alerts use `NSE:NIFTY_TOTAL_MKT` as the RS benchmark, the sector board uses `NSE:CNX500`. Keep each benchmark configurable in settings and show which one a number used. Default sector RS to the benchmark named in the snapshot.
- **US board (script already written; same payload shape with `"market":"US"`, benchmark `SP:SPX`, 29 rows).** Seed `sector_map` for US with these exact `sector` names → TradingView symbols, `kind` as shown:
  - *sector (11):* Technology `AMEX:XLK`, Financials `AMEX:XLF`, Energy `AMEX:XLE`, Health Care `AMEX:XLV`, Cons Discretionary `AMEX:XLY`, Cons Staples `AMEX:XLP`, Industrials `AMEX:XLI`, Materials `AMEX:XLB`, Utilities `AMEX:XLU`, Real Estate `AMEX:XLRE`, Comm Services `AMEX:XLC`.
  - *industry (18):* Semiconductors `NASDAQ:SMH`, Software `CBOE:IGV`, Cybersecurity `NASDAQ:CIBR`, Cloud Computing `NASDAQ:SKYY`, Biotech `AMEX:XBI`, Pharma `AMEX:XPH`, Medical Devices `AMEX:IHI`, Regional Banks `AMEX:KRE`, Homebuilders `AMEX:XHB`, Home Construction `CBOE:ITB`, Retail `AMEX:XRT`, Aerospace & Defense `CBOE:ITA`, Oil & Gas E&P `AMEX:XOP`, Oil Services `AMEX:OIH`, Airlines `AMEX:JETS`, Metals & Mining `AMEX:XME`, Gold Miners `AMEX:GDX`, Solar `AMEX:TAN`.
  - The payload does not carry `kind`; take it from `sector_map` by name. US `week` is the Monday date in America/New_York. Yahoo symbols are the plain ETF tickers (XLK, SMH, …); US constituents come from the ETF holdings CSV I upload. Build the Sectors page generically per market, with Sector and Industry shown as two groups (toggle) on the US tab.
  - TradingView alert messages are capped at 4096 characters; the board scripts warn on the chart if the JSON exceeds 4000.

## 6. Weinstein calculations (must match my Pine scripts exactly)

Weekly bars, Friday close. Implement in one tested module `lib/weinstein.ts`:
- `ma = SMA(close, 30)`; `slope = (ma − ma[4]) / ma[4] × 100`; `rising = slope > 0.5`; `falling = slope < −0.5`.
- **Stage:** if rising → (close ≥ ma ? 2 : 3); if falling → (close ≤ ma ? 4 : 1); else → (ma > ma[26] ? 3 : 1).
- **Mansfield RS:** `rs = close / benchClose`; `mrs = (rs / SMA(rs, 52) − 1) × 100`.
- **RS improving over n weeks (n = 4, 13, 26, 52):** `Δn = mrs − mrs[n]` (> 0 = improving).
- Write unit tests with known series so results match the Pine output.

## 7. Pages

### 7.1 Breakouts and Pullbacks (two tabs, same component)
- **Filter bar:** week arrows (◀ Week ending 20 Nov 2026 ▶), a custom date-range picker, chips: India / US / All, grade A / B / C, sector dropdown, industry dropdown, ticker search. **Default = latest week that has alerts.**
- **Welcome banner** on first load after login: "14 new stocks since Friday" (count of alerts created after the user's previous `last_seen_alerts_at`, with link). Rows added since that cutoff show a gold **New** badge. Keep the cutoff fixed for the session, then set `last_seen_alerts_at = now` once the user has viewed the list.
- **Columns:** New, Ticker + name, Market, Grade chip (A green, B amber, C red), Trigger price, Live price, % since trigger (green/red), Breakout level, Week volume, Avg volume (4W), Volume ratio (≥2 green, ≥1.5 amber, else red), Mansfield RS (green > 0), % above 30W MA, Overhead %, Sector, Industry, Quality Score, Flags. Sortable; column chooser; sticky header.
- **Flags** (computed from live price, icons + tooltip):
  - 🔴 *Below 30W MA* — live price < `ma30w` (compute the 30W SMA from provider weekly history; if unavailable, approximate from `trigger_price / (1 + pctAboveMA/100)` and mark "approx").
  - 🟠 *Extended* — live price more than 20% above `breakout_level`.
- Pullbacks tab additionally shows: original breakout date, original grade, weeks since breakout.
- **Click a row → right-hand side panel** (slides in; Esc closes):
  1. Header: ticker, market, grade, signal type, "Log trade" button (opens the trade form pre-filled with ticker, market, today's date, live price, linked alert).
  2. **Trigger vs live:** trigger price, breakout level, live price, % since trigger, grade, volume ratio, Mansfield RS, % above 30W MA, overhead %.
  3. **Weekly chart** with 30W MA, volume bars and a horizontal breakout-level line (use TradingView `lightweight-charts` with provider weekly history; plus an "Open in TradingView" link).
  4. **Sector context:** TradingView sector/industry label, plus the NSE sector indices (or US sector ETF) this stock belongs to via `sector_constituents`, each with its current Stage, Mansfield RS and focus star.
  5. **Fundamentals:** market cap, P/E, sales and EPS growth (YoY and QoQ), ROE/ROCE, debt-to-equity (show "—" when missing); sector P/E where the data allows.
  6. **Personal notes** (per user, autosave).

### 7.2 Sectors (India and US toggle)
- **Ranked sector table** (sorted by Mansfield RS desc by default; every column sortable): rank, sector, **Stage chip** (1 yellow, 2 green, 3 amber, 4 red), Mansfield RS, **RS change with a period toggle: 4W / 13W / 26W / 52W / All** (All shows all four columns + a sparkline), traded value this week, traded-value ratio vs 10-week average, vs 30W MA %, 4W %, this week's trigger count (number of alert stocks that are constituents of that sector), and a gold **★ focus** marker.
- **Focus rule (default):** `stage == 2 AND mrs > 0 AND Δ4 > 0 AND Δ13 > 0`. Make the rule a small configurable function (I will refine the money-flow part later; keep a clean extension point).
- **Traded value:** for each sector's official index constituents (NSE sector index lists; for US the sector ETF holdings), weekly traded value = Σ over constituents and days of `close × volume`; compare this week against the average of the previous 10 weeks. Constituents come from an uploadable CSV per sector (Settings → admin upload) with a monthly refresh reminder. Fetch in throttled, resumable chunks (Kite historical allows ~3 requests/second).
- **Backfill on first run:** 2 years of weekly index history (plus 52 weeks warm-up for RS) from Kite (India: fetch **daily** candles and aggregate to weeks — Kite has no weekly interval; verify limits in the docs) and Yahoo (US). Mark rows `source='backfill'`.

### 7.3 Dashboard
Four widgets: (1) **This week's triggers** by grade (A/B/C) and by market, with the latest week selector; (2) **Top sectors** — focus-star sectors (Stage 2 + RS improving) for India and US; (3) **Market regime light** — see Section 8; (4) **Open trades and total P&L** — open positions with live P&L, realised total, separate India (₹) and US ($).

### 7.4 Journal
- Trade form fields: stock (search, auto-fill from alerts), market, buy date, quantity, buy price, sell date (optional), sell price (optional), **strategy tag** (pick or type to create). No brokerage/charges modelling.
- **Summary cards on top** (India/US toggle): win rate, average gain %, average loss %, expectancy (win% × avg gain − loss% × avg loss), realised P&L.
- **Open / Closed tabs.** Open shows live price, unrealised P&L, holding days. Closed shows P&L ₹/$, %, holding days.
- **Per-strategy results table:** trades, win rate, average return %, total P&L, per tag.

### 7.5 Weekly Review
Auto-generated page per week (default: latest): triggers by grade/market, focus sectors and how they changed, trades opened/closed that week, win rate for the week, and a free-text **"My reflection"** box saved per user per week. Deterministic summaries only (no AI calls).

### 7.6 Settings
Site name; theme; **quotes manager** (add/edit/remove); **strategy tags manager** (create/rename/delete); **Zerodha connection** (status, "Connect Zerodha" button, token expiry, plan reminder); **Data downloads** (CSV and Excel .xlsx of alerts, trades, sector snapshots) and **backup status** (last backup time and result); **unmapped symbols** and **unresolved sector indices** reports.

## 8. Market regime light and the rule

- India: Nifty Total Market (fallback Nifty 500); US: S&P 500 (`^GSPC`). Weekly **Stage** via the Section 6 function.
- 🟢 Stage 2, 🟡 Stage 1, 🔴 Stage 3 or 4.
- **When either market is red:** show a **red banner only** at the top of the content ("India market is in Stage 3/4 — weak regime"). No blocking, no confirmation dialogs, no dimming.

## 9. Quality Score (0–100, bonus feature)

Computed when an alert is stored and recomputed when sector data or fundamentals arrive. Put all weights in one `lib/quality.ts` constants block, show the breakdown in a tooltip, and treat missing inputs as 0 while marking the score "partial".
- Grade: A 30, B 20, C 10.
- Volume ratio: `min(volRatio, 3) / 3 × 15`.
- Mansfield RS: `clamp(rs, 0, 20) / 20 × 15`.
- Room to run: overhead % ≤ 5 → 10, ≥ 15 → 0, linear between.
- Sector strength: focus ★ 15; Stage 2 + RS > 0 → 10; Stage 2 → 5; else 0 (use the best of the stock's constituent sectors).
- Fundamentals (15): sales growth YoY > 20% → 5; EPS growth YoY > 20% → 5; ROE > 15% → 2.5; debt-to-equity < 1 → 2.5.

## 10. Live prices

- Server route `/api/quotes?symbols=…` batches symbols per provider, caches ~30 s, and returns last price, previous close, timestamp, delayed flag. India: Kite `quote` (batch). US: Yahoo.
- The client polls every **30–60 s only while the tab is visible and that market is open**; otherwise fetch once on load and show "Market closed — last close". Hours: India 09:15–15:30 IST Mon–Fri; US 09:30–16:00 America/New_York (DST-aware). Do not poll for markets that are closed.
- **Zerodha login:** Kite's access token expires daily. Implement the standard Kite Connect login flow: "Connect Zerodha" button → Kite login → callback `/api/zerodha/callback` → exchange `request_token` for `access_token` server-side with the API secret → store encrypted in `provider_session`. Only the owner account sees the connect button; both users' data requests use the stored token. If the token is expired, show "Reconnect Zerodha (10 seconds)" and fall back to last close — never crash. **Never store my Zerodha password or TOTP secret.** Add a note in the README that Kite data is for personal use and I must check Zerodha's data terms before sharing beyond my household.

## 11. Security and ops

- Env vars: `NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_EMAILS, WEBHOOK_SECRET, KITE_API_KEY, KITE_API_SECRET, TOKEN_ENC_KEY, CRON_SECRET, BLOB_READ_WRITE_TOKEN`. Provide `.env.example`; **never commit secrets**; never log secrets or tokens.
- RLS on every table; service-role key server-side only; allow-list enforced in the auth callback **and** in RLS.
- **Nightly backup:** Vercel Cron → export all tables to JSON/CSV in **private Vercel Blob**, keep 30 days, log in `backup_log`. (Vercel Hobby cron runs at most daily and functions have time limits, so design long jobs — backfill, traded-value refresh — as chunked, resumable, idempotent jobs.)
- Weekly jobs: Saturday refresh of constituents' history and sector metrics (after both markets close and alerts have arrived); manual "Refresh now" button in Settings.
- Add security headers, input validation (zod), and structured server logs without secrets.

## 12. Phases and acceptance criteria

**Phase 1 — Core alerts**
Repo, Supabase schema + RLS, Google login with allow-list, login page exactly as in Section 3, layout shell (sidebar, theme, site name), webhook endpoint (secret check, raw log, idempotent upsert, week_ending rule), Breakouts + Pullbacks tabs with full filter bar, New badge + welcome banner, live prices (Zerodha adapter + mock; Yahoo for US), flags, side panel (trigger vs live, chart, notes), symbol mapping + unmapped report, nightly backup.
*Done when:* I can POST the sample payloads with `curl`, see the stocks appear, filter by week and date range, log in with only the two allowed emails, and see live/last prices with the "New" logic working.

**Phase 2 — Sectors and fundamentals**
Sector snapshot ingestion, 2-year backfill, RS and Δ4/13/26/52 metrics, constituents upload, traded-value engine, Sectors page (ranked table, period toggle, focus star), market regime light + red banner, Dashboard widgets 1–3, fundamentals display in the side panel, Quality Score.
*Done when:* the India sector table matches my TradingView "Weinstein Sector Board" for Stage/RS within rounding, and focus stars follow the Section 7.2 rule.

**Phase 3 — Journal and polish**
Trades, strategy tags, Journal page (cards, open/closed, per-strategy table), dashboard open trades/P&L, Weekly Review + reflections, full Settings (quotes, tags, Zerodha, downloads, backups), CSV and Excel exports, US sector board support (industries), mobile polish, accessibility pass, README with setup steps (Supabase, Google OAuth, Vercel env vars, Kite app redirect URL, TradingView webhook URL and message format).
*Done when:* I can log a buy and a sell, see win rate and per-strategy results, download my data, and use the whole app comfortably on my phone.

## 13. Before you write code, ask me only for:
1. Supabase project URL and keys (or ask me to create the project and tell me the exact clicks).
2. The two allowed Google email addresses.
3. The site's final URL (Vercel link is fine) for OAuth and Kite redirect settings.
4. Any real alert JSON samples I can paste to confirm the contract.

Then start Phase 1. Tell me what you built after each phase in 6 bullets or fewer.


---
## 14. Additions after design review (these override anything above)

**14.1 Open chart in TradingView.** Clicking a ticker (breakouts rows, side-panel header, dashboard open trades, journal rows) opens `https://www.tradingview.com/chart/?symbol=<EXCHANGE>%3A<TICKER>` (e.g. `NSE%3ATCS`, `NASDAQ%3AAAPL`) in a NEW tab (`target="_blank" rel="noopener"`). It opens in the user's own signed-in TradingView because it is his browser. Clicking elsewhere on a row opens the side panel. The side panel also has an "Open in TradingView" button next to "Log trade". Store `exchange` per stock (from the alert) so the link is correct.

**14.2 "Data last updated" strip** at the top of every app page (below the page header, above content), small muted text, IST:
- Prices updated: `Tue 24 Nov 2026, 13:15:42 IST` + `India live / US delayed ~15 min`
- Alerts received: time of the latest webhook alert
- Sector snapshot: time of the latest sector-board webhook
- A "Refresh now" button.
Freshness dot: green = updated within 2 min while market open; amber = 2-10 min; red = older, or Zerodha token expired (then show the "Connect Zerodha" button). Outside market hours show "Market closed - showing last close".

**14.3 Visual reference.** The folder `/design` in the repo (zip supplied: `my-journey-visual-reference.zip`, 5 static HTML screens: login, dashboard, breakouts + panel, sectors, journal) is the visual source of truth. Copy its CSS variables into Tailwind theme tokens, match colours, fonts (Inter + Cormorant Garamond), spacing, table density and layout. After each page is built, take a screenshot at 1440 px and compare it side by side with the reference; fix visible differences. Sample data in the reference is invented; real data replaces it. Expect small differences from real data length and chart rendering - that is fine.

---
## 15. Performance page (new sidebar item "Performance") - Phase 2

Time-frame selector: This month / 3M / 6M / 1Y / YTD / All / custom range. Market toggle India | US (never combine INR and USD).

**15.1 Trade stats (from the journal, closed trades in the range):** win rate, avg win %, avg loss %, expectancy per trade, profit factor, best/worst trade, avg holding days, max drawdown, equity curve, results by strategy tag. Colour: green/amber/red.

**15.2 "If I had held" (hold-vs-sold comparison) - key feature.** For every closed trade: Bought price, Sold price, Actual return %, Return if held till today % (current price vs buy price), Difference (pts), and a verdict: "Sold too early" (held > actual), "Good exit" (held < actual). Summary cards: total actual P&L vs total hypothetical hold P&L, % of exits that were too early, average return left on the table, average return saved by exiting. Open trades are excluded (or shown as "still holding"). Optional: also show the peak price after sell and % missed vs peak.

**15.3 Shortlist performance (stocks that triggered an alert, even if never bought):** for every triggered stock in the selected time frame: trigger price (week_ending close), current price, return since trigger %, max gain since trigger %, max drawdown since trigger %, bought? (Yes/No/Skipped). Summary: average return of all triggered stocks, % that are in profit, average of Grade A vs B vs C, Breakouts vs Pullbacks, India vs US, "bought" vs "skipped" comparison, top 10 and bottom 10. Filter by grade, sector, signal type, week range. This shows whether his picks and his skipping decisions are right.

**Data:** needs daily close history per triggered stock since trigger (store `price_history` daily closes for triggered tickers, updated by the nightly job; use Kite for India, Yahoo for US). Export to CSV/Excel.


---
## 16. Sectors page: 1-week change columns (added)
On the Sectors table (India and US), right after the Sector name show four "this week vs last week" columns: **1W price** (% change of the sector index, weekly close vs previous weekly close), **1W RS change** (Mansfield RS points now minus last week), **1W traded value** (% change vs last week), **Rank move 1W** (places up/down in the ranking, green up arrow / red down arrow). Green = improving, red = weakening. Data comes from comparing the two latest weekly sector snapshots; if only one snapshot exists show a dash. Sort by any column. Include 1W columns in the CSV export. Visual reference: design/my-journey-sectors.html.

---
## 17. Review fixes (reliability and data safety) - these override earlier sections

**17.1 Webhook must be fast and loss-proof.** TradingView waits about 3 seconds and never retries. On every POST: check secret, write the raw body to `alerts_raw` (secret removed) and return 200 immediately; parse and upsert into the real tables afterwards (queued or in the same request only if it is quick). Use the Supabase pooled connection. Add: a Settings "Alert health" panel (alerts received this week vs the previous week, last alert time, rejected count), a banner if no alert arrived by Saturday 12:00 IST in a normal week, and a "Replay" button that re-processes any `alerts_raw` row. Log and keep failures; never drop.

**17.2 Rate limit.** Do NOT throttle requests that carry the correct secret (a whole watchlist can fire within seconds). Rate-limit and size-cap only requests with a wrong or missing secret.

**17.3 Splits, bonus issues and other corporate actions.** Store split/bonus-adjusted price history. Keep `trigger_price` as originally received plus `adjustment_factor` (default 1). When live price vs trigger changes by more than 40% in one day, flag the stock "Possible split or bonus - check" and exclude it from return statistics until I confirm. Provide a manual "Apply adjustment (ratio)" tool that recalculates trigger price, buy/sell prices shown in Performance, stops and flags. Never silently show a fake -50%.

**17.4 TradingView is the source of truth for triggers.** The site's own calculations from Kite/Yahoo data (mid-week stage, RS, "if I had held") are labelled "indicative". Tests for the Weinstein functions allow a small tolerance against my Pine values (list differences instead of failing). Never overwrite an alert's stored grade or stage with a site-calculated one.

**17.5 Free-tier safety.** Cache live prices server-side (one fetch per symbol per 30-60 s, shared by both users and all tabs; batch Kite quote calls; respect Kite rate limits). Show a "Stale" label and last good price when a provider fails; Yahoo failures must never break pages. Add a weekly keep-alive/health cron so Supabase free does not pause, and a database-size indicator in Settings (warn at 400 MB of 500 MB). Keep price history only for triggered tickers and tickers in trades.

**17.6 Sector alert size.** The Pine boards warn on chart if JSON > 4000 characters. The site must accept a partial snapshot (some rows missing), store it, and show "Partial snapshot: n of m sectors" instead of failing. Test the fundamentals-enabled stock scripts on the full watchlist before relying on them (Pine run-time limit).

**17.7 Smaller items.**
- Market holidays: a week with a Friday holiday uses the last trading day; store `week_ending` as sent by the rule in Section 5 but display the real last trading date, and keep a holiday table (NSE, NYSE) that can be edited.
- Symbol mapping: handle tickers with special characters (M&M, BAJAJ-AUTO, NIFTY names, class shares like BRK.B) with an editable mapping table and the existing "unmapped symbols" report.
- Kite login expires daily: one-tap reconnect on the Dashboard header, and never block pages when expired.
- Data terms: README note to check Zerodha and Yahoo data terms; use data for personal/household use only.
