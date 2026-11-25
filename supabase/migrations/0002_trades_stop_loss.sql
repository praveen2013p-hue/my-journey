-- R-multiple risk management (DECISIONS.md backlog): an optional stop-loss
-- price per trade, used to express realized P&L as a multiple of the risk
-- taken ((sell_price - buy_price) / (buy_price - stop_loss)) rather than
-- only ₹/$ or %. Nullable and additive - existing trades are unaffected.
alter table trades add column if not exists stop_loss numeric;
