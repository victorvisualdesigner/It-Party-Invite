-- Pay small small: an event's admin can let guests send the ticket price in parts. Each part is its
-- own payment row, and the invite turns paid once the confirmed parts add up to the price.
-- Safe to run once on top of the earlier migrations.

alter table public.event add column if not exists installments boolean not null default false;

-- Same lockdown as before: nothing for the public API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
grant execute on function public.hit_attempt(text, integer) to service_role;
grant execute on function public.add_no_taps(uuid, integer) to service_role;
grant usage, select on sequence public.event_id_seq to service_role;
