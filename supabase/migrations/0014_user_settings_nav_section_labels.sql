-- Two more renameable sidebar section labels (DECISIONS.md), same pattern
-- as nav_long_term_label ("Investment"): "Scanner" above Breakouts/
-- Pullbacks/Sectors, and "Trading" above Journal/US Trading Capital/Weekly
-- Review/Performance.
alter table public.user_settings
  add column if not exists nav_scanner_label text not null default 'Scanner';

alter table public.user_settings
  add column if not exists nav_trading_label text not null default 'Trading';
