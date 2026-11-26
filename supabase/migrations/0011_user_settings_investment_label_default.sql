-- The sidebar section label's default changed from "My Long Term
-- Holding" to "Investment" (DECISIONS.md - a hand-sketched correction).
-- Updates the column default for new rows, and any row still sitting
-- on the old default (nobody would have deliberately renamed it away
-- from the default this soon) gets the new one too.
alter table public.user_settings
  alter column nav_long_term_label set default 'Investment';

update public.user_settings
  set nav_long_term_label = 'Investment'
  where nav_long_term_label = 'My Long Term Holding';
