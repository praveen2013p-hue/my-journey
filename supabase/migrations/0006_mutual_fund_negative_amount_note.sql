-- A short, user-written comment explaining why a month's SIP Amount
-- (amount_added) was entered as negative (e.g. a correction/reversal).
-- Null when the entry has never had a negative amount, or the user
-- hasn't explained it yet.
alter table public.mutual_fund_entries
  add column if not exists negative_amount_note text;
