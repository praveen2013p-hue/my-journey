-- Goal tracking for Mutual Funds (DECISIONS.md): an optional target
-- corpus per profile ("Self", "Wife", ...). Purely informational - never
-- affects any invested/gain/XIRR math. Nullable: most profiles won't set
-- one, and "no goal set yet" is a real, distinct state from "goal is 0".
alter table public.mutual_fund_profiles
  add column if not exists goal_amount numeric;
