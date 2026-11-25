-- Sidebar label for the category grouping NPS and Mutual Funds together
-- (DECISIONS.md) - renameable per user, defaults to "My Long Term Holding".
alter table public.user_settings
  add column if not exists nav_long_term_label text not null default 'My Long Term Holding';
