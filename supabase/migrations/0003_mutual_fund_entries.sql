-- Mutual Fund tracker: replaces the user's manual Google Sheet with one
-- row per user per calendar month. One aggregate portfolio number, not
-- per-scheme (DECISIONS.md) - `amount_added` is that month's fresh
-- contribution; "total invested to date" is derived app-side by summing
-- every month's amount_added, never stored, so there's one fewer number
-- to type (and get wrong) each month.
create table mutual_fund_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  amount_added numeric not null default 0,
  current_value numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);
create index mutual_fund_entries_user_id_idx on mutual_fund_entries (user_id);

alter table mutual_fund_entries enable row level security;

create policy "user reads own mutual_fund_entries" on mutual_fund_entries for select using (user_id = auth.uid());
create policy "user writes own mutual_fund_entries" on mutual_fund_entries for insert with check (user_id = auth.uid());
create policy "user updates own mutual_fund_entries" on mutual_fund_entries for update using (user_id = auth.uid());
create policy "user deletes own mutual_fund_entries" on mutual_fund_entries for delete using (user_id = auth.uid());
