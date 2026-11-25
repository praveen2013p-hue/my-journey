-- Breaks "amount_added" down by how the money went in, since the user's
-- real contributions are a mix of SIP, lumpsum and STP in the same month
-- and lumping them into one field made accurate entry hard. All four are
-- nullable: null means "never classified" (entries created before this
-- migration), distinct from 0 ("classified, and this type was zero that
-- month"). amount_added itself is unchanged - it's still the sum of
-- these four, computed by the app, and still what every stat
-- (cumulativeInvested, XIRR, etc.) reads.
alter table public.mutual_fund_entries
  add column if not exists sip_amount numeric,
  add column if not exists lumpsum_amount numeric,
  add column if not exists stp_amount numeric,
  add column if not exists other_amount numeric;
