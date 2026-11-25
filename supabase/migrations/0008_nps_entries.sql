-- NPS (National Pension System) tracker: one row per user per calendar
-- month, same structural pattern as mutual_fund_entries - one aggregate
-- portfolio number, not per-scheme. Brand new table with no existing
-- production data, so the full final column set (the one
-- mutual_fund_entries only reached after 7 incremental migrations) goes
-- in from the start instead of being replayed incrementally.
create table nps_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  -- Always sip_amount + lumpsum_amount + stp_amount + other_amount
  -- (each defaulting to 0) - computed by the app, never typed directly.
  amount_added numeric not null default 0,
  sip_amount numeric,
  lumpsum_amount numeric,
  stp_amount numeric,
  other_amount numeric,
  withdrawal numeric not null default 0,
  planned_amount numeric,
  current_value numeric not null,
  notes text,
  negative_amount_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);
create index nps_entries_user_id_idx on nps_entries (user_id);

alter table nps_entries enable row level security;

create policy "user reads own nps_entries" on nps_entries for select using (user_id = auth.uid());
create policy "user writes own nps_entries" on nps_entries for insert with check (user_id = auth.uid());
create policy "user updates own nps_entries" on nps_entries for update using (user_id = auth.uid());
create policy "user deletes own nps_entries" on nps_entries for delete using (user_id = auth.uid());
