-- Mutual Fund tracker: two more optional per-month fields.
-- `withdrawal` nets out of invested capital (money taken out of the fund);
-- `planned_amount` is purely informational (what the user's own plan
-- called for that month) and never affects the invested/gain math.
alter table mutual_fund_entries add column if not exists withdrawal numeric not null default 0;
alter table mutual_fund_entries add column if not exists planned_amount numeric;
