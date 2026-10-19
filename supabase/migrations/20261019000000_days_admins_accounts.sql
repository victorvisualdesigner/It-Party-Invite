-- Multi-day events, longer holds, more than one admin, and payout accounts that can be removed.
-- Safe to run once on top of the first two migrations.

-- 1. Dates. An event can run over several days: end_date is the last day (Lagos calendar date),
--    and days holds an optional name and dress code for each day, e.g.
--    [{"date": "2027-04-12", "name": "Welcome night", "dress_code": "All white"}].
alter table public.event add column if not exists end_date date;
alter table public.event add column if not exists days jsonb not null default '[]'::jsonb;
alter table public.event drop constraint if exists event_days_is_array;
alter table public.event add constraint event_days_is_array check (jsonb_typeof(days) = 'array');

-- 2. The hold window for unpaid invites can be up to a year, in hours.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.event'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%hold_window_hours%'
  loop
    execute format('alter table public.event drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.event add constraint event_hold_window_hours_check check (hold_window_hours between 1 and 8760);

-- 3. Admins. The first admin becomes the superadmin, who can add and remove other admins.
--    A new admin sets their own password through a one time link (only its hash is stored).
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.people'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.people drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.people add constraint people_role_check check (role in ('superadmin', 'admin', 'member'));
alter table public.people add constraint admins_are_unlimited check (role = 'member' or slot_limit is null);
alter table public.people add column if not exists email text;
alter table public.people add column if not exists setup_hash text;
alter table public.people add column if not exists setup_expires_at timestamptz;
create unique index if not exists people_setup_hash_unique on public.people (setup_hash) where setup_hash is not null;
update public.people set role = 'superadmin'
 where id = (select id from public.people where role = 'admin' and active order by created_at limit 1)
   and not exists (select 1 from public.people where role = 'superadmin');

-- 4. Payout accounts. One with payments on it is archived instead of deleted, so the records stay.
alter table public.payout_accounts add column if not exists archived_at timestamptz;
alter table public.payout_accounts drop constraint if exists payout_accounts_active_not_archived;
alter table public.payout_accounts add constraint payout_accounts_active_not_archived check (not (active and archived_at is not null));

create or replace function public.set_active_account(p_account_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.payout_accounts where id = p_account_id and archived_at is null) then
    raise exception 'account_not_found';
  end if;
  update public.payout_accounts set active = false where active and id <> p_account_id;
  update public.payout_accounts set active = true where id = p_account_id;
end $$;

-- Same lockdown as before: nothing for the public API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
grant execute on function public.hit_attempt(text, integer) to service_role;
grant execute on function public.add_no_taps(uuid, integer) to service_role;
