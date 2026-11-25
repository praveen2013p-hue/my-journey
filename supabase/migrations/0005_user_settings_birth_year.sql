-- "Safe SWP" (DECISIONS.md, Mutual Funds): needed to compute years
-- remaining until age 90, per user - Praveen and his wife have
-- different birth years, so this can't be a hardcoded constant.
alter table user_settings add column if not exists birth_year integer;
