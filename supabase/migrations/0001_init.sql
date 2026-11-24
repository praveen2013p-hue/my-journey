-- My Journey — initial schema (BRIEF.md §4, plus §11 security, §15-17
-- additions). Run this against a fresh Supabase project once one exists;
-- see DECISIONS.md for the two defaults this file adds beyond §4
-- (app_settings, allowed_users).

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ============================================================================
-- Allow-list mirror. BRIEF.md §2 keeps the real allow-list in the
-- ALLOWED_EMAILS env var (checked in the Next.js auth callback); this table
-- is written by the server from that same env var so RLS can reference it
-- too ("allow-list enforced in the auth callback AND in RLS", BRIEF.md §11).
-- ============================================================================
create table allowed_users (
  email text primary key
);

create or replace function is_allowed_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from allowed_users where email = auth.jwt() ->> 'email'
  );
$$;

-- ============================================================================
-- Global app settings (one row). Site name is global per §2; everything
-- else per-user lives in user_settings below.
-- ============================================================================
create table app_settings (
  id smallint primary key default 1 check (id = 1),
  site_name text not null default 'My Journey',
  bench_in text not null default 'NSE:NIFTY_TOTAL_MKT',
  bench_in_sector text not null default 'NSE:CNX500',
  bench_us text not null default 'SP:SPX',
  bench_us_sector text not null default 'SP:SPX',
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1);

alter table app_settings enable row level security;
create policy "allowed users can read app_settings" on app_settings
  for select using (is_allowed_user());

-- ============================================================================
-- Shared data (read: allow-listed users; write: server/service-role only)
-- ============================================================================

create table alerts_raw (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  body jsonb not null, -- secret field stripped before insert, §17.1
  accepted boolean not null default false,
  reason text,
  processed_at timestamptz
);
create index alerts_raw_received_at_idx on alerts_raw (received_at desc);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('IN', 'US')),
  exchange text not null,
  ticker text not null,
  signal_type text not null check (signal_type in ('breakout', 'pullback')),
  grade text not null check (grade in ('A', 'B', 'C')),
  week_ending date not null,
  triggered_at timestamptz not null,
  trigger_price numeric not null,
  open numeric,
  high numeric,
  low numeric,
  volume numeric,
  breakout_level numeric,
  vol_ratio numeric,
  mrs numeric,
  pct_above_ma numeric,
  overhead_pct numeric,
  sector text,
  industry text,
  fundamentals jsonb,
  ma30w numeric,
  quality_score integer,
  quality_breakdown jsonb,
  -- §17.3 split/bonus safety: trigger_price is never silently rewritten.
  adjustment_factor numeric not null default 1,
  needs_adjustment_review boolean not null default false,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, ticker, signal_type, week_ending)
);
create index alerts_week_ending_idx on alerts (week_ending desc);
create index alerts_ticker_idx on alerts (ticker);

create table sector_snapshots (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  week_ending date not null,
  sector text not null,
  stage smallint check (stage between 1 and 4),
  mrs numeric,
  rs_up boolean,
  vs_ma numeric,
  chg4 numeric,
  focus boolean not null default false,
  source text not null default 'alert' check (source in ('alert', 'backfill')),
  created_at timestamptz not null default now(),
  unique (market, week_ending, sector)
);

create table sector_metrics (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  week_ending date not null,
  sector text not null,
  rank smallint,
  mrs numeric,
  d4 numeric,
  d13 numeric,
  d26 numeric,
  d52 numeric,
  traded_value numeric,
  tv_avg10 numeric,
  tv_ratio numeric,
  is_focus boolean not null default false,
  -- §16: this-week-vs-last-week columns
  price_chg_1w numeric,
  rs_chg_1w numeric,
  traded_value_chg_1w numeric,
  rank_move_1w smallint,
  created_at timestamptz not null default now(),
  unique (market, week_ending, sector)
);

create table sector_map (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  display_name text not null,
  tv_symbol text,
  provider_symbol text,
  kind text not null check (kind in ('sector', 'industry')),
  unique (market, display_name)
);

create table sector_constituents (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  sector text not null,
  ticker text not null,
  updated_at timestamptz not null default now(),
  unique (market, sector, ticker)
);

create table symbol_map (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  tv_ticker text not null,
  kite_symbol text,
  yahoo_symbol text,
  exchange text,
  status text not null default 'mapped' check (status in ('mapped', 'unmapped')),
  notes text,
  unique (market, tv_ticker)
);

create table provider_session (
  id bigserial primary key,
  provider text not null unique check (provider in ('zerodha')),
  access_token_encrypted text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Login-page quotes. Publicly readable (no secrets) per §3.
create table quotes (
  id bigserial primary key,
  text text not null,
  author text,
  owner_id uuid references auth.users (id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table backup_log (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('success', 'failure')),
  detail text
);

-- Daily closes for triggered tickers + tickers ever traded, per §15/§17.5
-- ("keep price history only for triggered tickers and tickers in trades").
create table price_history (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  ticker text not null,
  date date not null,
  close numeric not null,
  adjustment_factor numeric not null default 1,
  unique (market, ticker, date)
);
create index price_history_ticker_date_idx on price_history (market, ticker, date desc);

-- §17.7: editable holiday calendar so a Friday holiday week still resolves
-- to the right last-trading-day display.
create table holidays (
  id bigserial primary key,
  market text not null check (market in ('IN', 'US')),
  holiday_date date not null,
  description text,
  unique (market, holiday_date)
);

alter table alerts_raw enable row level security;
alter table alerts enable row level security;
alter table sector_snapshots enable row level security;
alter table sector_metrics enable row level security;
alter table sector_map enable row level security;
alter table sector_constituents enable row level security;
alter table symbol_map enable row level security;
alter table provider_session enable row level security;
alter table quotes enable row level security;
alter table backup_log enable row level security;
alter table price_history enable row level security;
alter table holidays enable row level security;

create policy "allowed users can read alerts_raw" on alerts_raw for select using (is_allowed_user());
create policy "allowed users can read alerts" on alerts for select using (is_allowed_user());
create policy "allowed users can read sector_snapshots" on sector_snapshots for select using (is_allowed_user());
create policy "allowed users can read sector_metrics" on sector_metrics for select using (is_allowed_user());
create policy "allowed users can read sector_map" on sector_map for select using (is_allowed_user());
create policy "allowed users can read sector_constituents" on sector_constituents for select using (is_allowed_user());
create policy "allowed users can read symbol_map" on symbol_map for select using (is_allowed_user());
create policy "allowed users can read provider_session" on provider_session for select using (is_allowed_user());
create policy "anyone can read active quotes" on quotes for select using (active = true);
create policy "allowed users can read backup_log" on backup_log for select using (is_allowed_user());
create policy "allowed users can read price_history" on price_history for select using (is_allowed_user());
create policy "allowed users can read holidays" on holidays for select using (is_allowed_user());
-- No insert/update/delete policies on any table above for anon/authenticated:
-- only the service-role key (used server-side only, §11) can write them.

-- ============================================================================
-- Per-user data (RLS: user_id = auth.uid())
-- ============================================================================

create table user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  timezone text not null default 'Asia/Kolkata',
  last_seen_alerts_at timestamptz,
  updated_at timestamptz not null default now()
);

create table strategy_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  market text not null check (market in ('IN', 'US')),
  ticker text not null,
  buy_date date not null,
  quantity numeric not null,
  buy_price numeric not null,
  sell_date date,
  sell_price numeric,
  strategy_tag_id uuid references strategy_tags (id) on delete set null,
  alert_id uuid references alerts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index trades_user_id_idx on trades (user_id);

create table stock_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  market text not null check (market in ('IN', 'US')),
  ticker text not null,
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, market, ticker)
);

create table weekly_reflections (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_ending date not null,
  text text,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_ending)
);

alter table user_settings enable row level security;
alter table strategy_tags enable row level security;
alter table trades enable row level security;
alter table stock_notes enable row level security;
alter table weekly_reflections enable row level security;

create policy "user reads own user_settings" on user_settings for select using (user_id = auth.uid());
create policy "user writes own user_settings" on user_settings for insert with check (user_id = auth.uid());
create policy "user updates own user_settings" on user_settings for update using (user_id = auth.uid());

create policy "user reads own strategy_tags" on strategy_tags for select using (user_id = auth.uid());
create policy "user writes own strategy_tags" on strategy_tags for insert with check (user_id = auth.uid());
create policy "user updates own strategy_tags" on strategy_tags for update using (user_id = auth.uid());
create policy "user deletes own strategy_tags" on strategy_tags for delete using (user_id = auth.uid());

create policy "user reads own trades" on trades for select using (user_id = auth.uid());
create policy "user writes own trades" on trades for insert with check (user_id = auth.uid());
create policy "user updates own trades" on trades for update using (user_id = auth.uid());
create policy "user deletes own trades" on trades for delete using (user_id = auth.uid());

create policy "user reads own stock_notes" on stock_notes for select using (user_id = auth.uid());
create policy "user writes own stock_notes" on stock_notes for insert with check (user_id = auth.uid());
create policy "user updates own stock_notes" on stock_notes for update using (user_id = auth.uid());

create policy "user reads own weekly_reflections" on weekly_reflections for select using (user_id = auth.uid());
create policy "user writes own weekly_reflections" on weekly_reflections for insert with check (user_id = auth.uid());
create policy "user updates own weekly_reflections" on weekly_reflections for update using (user_id = auth.uid());
