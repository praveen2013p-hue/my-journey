-- Family-member tree for Mutual Funds (DECISIONS.md): the user wants to
-- track more than just their own portfolio under one login - e.g. a
-- spouse's or a child's - each as its own independent month-by-month
-- history, in the same account. A "profile" is just a name (fully
-- open - no preset Wife/Son/Daughter, the user types whatever they
-- want); every existing user already has real entries, so this
-- migration backfills a "Self" profile per user and attributes their
-- existing rows to it - never drops or orphans data.
create table public.mutual_fund_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index mutual_fund_profiles_user_id_idx on public.mutual_fund_profiles (user_id);

alter table public.mutual_fund_profiles enable row level security;

create policy "user reads own mutual_fund_profiles" on public.mutual_fund_profiles for select using (user_id = auth.uid());
create policy "user writes own mutual_fund_profiles" on public.mutual_fund_profiles for insert with check (user_id = auth.uid());
create policy "user updates own mutual_fund_profiles" on public.mutual_fund_profiles for update using (user_id = auth.uid());
create policy "user deletes own mutual_fund_profiles" on public.mutual_fund_profiles for delete using (user_id = auth.uid());

-- One "Self" profile per user who already has mutual fund entries.
insert into public.mutual_fund_profiles (user_id, name)
  select distinct user_id, 'Self' from public.mutual_fund_entries
  on conflict (user_id, name) do nothing;

alter table public.mutual_fund_entries
  add column if not exists profile_id uuid references public.mutual_fund_profiles (id) on delete cascade;

-- Attribute every existing row to that user's "Self" profile.
update public.mutual_fund_entries e
  set profile_id = p.id
  from public.mutual_fund_profiles p
  where p.user_id = e.user_id and p.name = 'Self' and e.profile_id is null;

alter table public.mutual_fund_entries
  alter column profile_id set not null;

-- One entry per profile per month, not per user per month - a "Wife" or
-- "Son" profile can now have their own Jan 2026 entry alongside "Self"'s.
alter table public.mutual_fund_entries
  drop constraint if exists mutual_fund_entries_user_id_month_key;

alter table public.mutual_fund_entries
  add constraint mutual_fund_entries_user_id_profile_month_key unique (user_id, profile_id, month);

create index mutual_fund_entries_profile_id_idx on public.mutual_fund_entries (profile_id);
