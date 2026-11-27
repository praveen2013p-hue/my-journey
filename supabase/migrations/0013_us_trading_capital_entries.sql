-- US Trading Capital tracker: one row per user per calendar month,
-- tracking capital deposited (INR converted to USD) into a US
-- swing-trading brokerage account, and that month's balance. A leaner
-- sibling of mutual_fund_entries/nps_entries - no SIP/Lumpsum/STP
-- breakdown, no planned_amount, no Safe SWP. Two independent return
-- figures are computed from these columns (lib/us-trading-capital-stats.ts):
--   - a USD-only annualized return (amount_added/withdrawal/current_value)
--   - a Real Return (FX-adjusted, in INR), using inr_amount/fx_rate (the
--     rate that month's deposit converted at) and value_fx_rate (the
--     rate as of that month's current_value snapshot)
-- Brand new table with no existing production data, so the full final
-- column set goes in from the start, same precedent as nps_entries.
create table us_trading_capital_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  amount_added numeric not null default 0,
  withdrawal numeric not null default 0,
  inr_amount numeric,
  fx_rate numeric,
  value_fx_rate numeric,
  current_value numeric not null,
  notes text,
  negative_amount_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);
create index us_trading_capital_entries_user_id_idx on us_trading_capital_entries (user_id);

alter table us_trading_capital_entries enable row level security;

create policy "user reads own us_trading_capital_entries" on us_trading_capital_entries for select using (user_id = auth.uid());
create policy "user writes own us_trading_capital_entries" on us_trading_capital_entries for insert with check (user_id = auth.uid());
create policy "user updates own us_trading_capital_entries" on us_trading_capital_entries for update using (user_id = auth.uid());
create policy "user deletes own us_trading_capital_entries" on us_trading_capital_entries for delete using (user_id = auth.uid());
