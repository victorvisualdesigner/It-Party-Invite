-- Per guest controls for the hosts: a price of their own, the VIP card, and whether they may say
-- their inviter is paying (with the time a host turned such a request down).
-- Safe to run once on top of the earlier migrations.

-- Null means the event's price. Zero lets them in free.
alter table public.invites add column if not exists price_kobo integer;
alter table public.invites drop constraint if exists invites_price_kobo_check;
alter table public.invites add constraint invites_price_kobo_check check (price_kobo is null or price_kobo >= 0);
alter table public.invites add column if not exists vip boolean not null default false;
alter table public.invites add column if not exists ask_inviter_off boolean not null default false;
alter table public.invites add column if not exists pay_request_rejected_at timestamptz;

-- Same lockdown as before: nothing for the public API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
grant execute on function public.hit_attempt(text, integer) to service_role;
grant execute on function public.add_no_taps(uuid, integer) to service_role;
grant usage, select on sequence public.event_id_seq to service_role;
