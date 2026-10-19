-- Many events. The superadmin creates events, each run by its own event admins, with its own
-- members, guests, payments, payout accounts and numbers. One database: every row carries its
-- event, and the app reads and writes one event at a time. The event that exists today becomes
-- event 1 and keeps all its data. Safe to run once on top of the first three migrations.

-- 1. The event table holds many rows now.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.event'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%(id = 1)%'
  loop
    execute format('alter table public.event drop constraint %I', r.conname);
  end loop;
end $$;
create sequence if not exists public.event_id_seq as smallint owned by public.event.id;
select setval('public.event_id_seq', greatest((select coalesce(max(id), 0) from public.event), 1));
alter table public.event alter column id set default nextval('public.event_id_seq');
alter table public.event add column if not exists created_at timestamptz not null default now();
-- How the guest's card looks: {"theme": "emerald", "foil": "gold", "paper": "cream", "note": ""}.
alter table public.event add column if not exists card jsonb not null default '{}'::jsonb;
alter table public.event drop constraint if exists event_card_is_object;
alter table public.event add constraint event_card_is_object check (jsonb_typeof(card) = 'object');

-- 2. People belong to an event, except the superadmin, who sees every event.
alter table public.people add column if not exists event_id smallint references public.event (id);
update public.people set event_id = 1 where event_id is null and role <> 'superadmin';
alter table public.people drop constraint if exists people_event_by_role;
alter table public.people add constraint people_event_by_role check ((role = 'superadmin') = (event_id is null));
-- The same phone can be a member of two events, but only once in each.
alter table public.people drop constraint if exists people_phone_e164_key;
create unique index if not exists people_phone_per_event on public.people (coalesce(event_id, 0), phone_e164);
create index if not exists people_event_idx on public.people (event_id, role);

-- 3. Invites. Live numbers and message combinations are unique inside one event only.
alter table public.invites add column if not exists event_id smallint references public.event (id);
update public.invites set event_id = 1 where event_id is null;
alter table public.invites alter column event_id set not null;
drop index if exists public.invites_one_live_per_phone;
create unique index invites_one_live_per_phone on public.invites (event_id, guest_phone_e164)
  where status not in ('draft', 'expired', 'cancelled');
drop index if exists public.invites_message_combo_unique;
create unique index invites_message_combo_unique on public.invites (event_id, message_combo);
create index if not exists invites_event_status_idx on public.invites (event_id, status);

-- An invite takes its inviter's event when none is given. A superadmin must always say which.
create or replace function public.invite_event_from_inviter() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.event_id is null then
    select event_id into new.event_id from public.people where id = new.inviter_id;
  end if;
  if new.event_id is null then
    raise exception 'invite_needs_event';
  end if;
  return new;
end $$;
drop trigger if exists invites_event on public.invites;
create trigger invites_event before insert on public.invites
  for each row execute function public.invite_event_from_inviter();

-- 4. Payout accounts: one active account per event.
alter table public.payout_accounts add column if not exists event_id smallint references public.event (id);
update public.payout_accounts set event_id = 1 where event_id is null;
alter table public.payout_accounts alter column event_id set not null;
drop index if exists public.payout_accounts_one_active;
create unique index payout_accounts_one_active on public.payout_accounts (event_id) where active;

create or replace function public.set_active_account(p_account_id uuid) returns void
language plpgsql set search_path = '' as $$
declare e smallint;
begin
  select event_id into e from public.payout_accounts where id = p_account_id and archived_at is null;
  if e is null then
    raise exception 'account_not_found';
  end if;
  update public.payout_accounts set active = false where active and event_id = e and id <> p_account_id;
  update public.payout_accounts set active = true where id = p_account_id;
end $$;

-- 5. Payments and the audit log carry the event too. Rows tied to an invite fill it in themselves.
alter table public.payments add column if not exists event_id smallint references public.event (id);
update public.payments p set event_id = i.event_id from public.invites i where i.id = p.invite_id and p.event_id is null;
alter table public.payments alter column event_id set not null;
create index if not exists payments_event_status_idx on public.payments (event_id, status);

alter table public.audit_log add column if not exists event_id smallint references public.event (id);
update public.audit_log a set event_id = i.event_id from public.invites i where i.id = a.invite_id and a.event_id is null;
update public.audit_log set event_id = 1 where event_id is null;
create index if not exists audit_log_event_idx on public.audit_log (event_id, created_at desc);

create or replace function public.event_from_invite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.event_id is null and new.invite_id is not null then
    select event_id into new.event_id from public.invites where id = new.invite_id;
  end if;
  return new;
end $$;
drop trigger if exists payments_event on public.payments;
create trigger payments_event before insert on public.payments
  for each row execute function public.event_from_invite();
drop trigger if exists audit_log_event on public.audit_log;
create trigger audit_log_event before insert on public.audit_log
  for each row execute function public.event_from_invite();

-- Same lockdown as before: nothing for the public API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
grant execute on function public.hit_attempt(text, integer) to service_role;
grant execute on function public.add_no_taps(uuid, integer) to service_role;
grant usage, select on sequence public.event_id_seq to service_role;
