-- A guest can say, on the transfer screen, that their inviter is paying for them. The time they
-- asked is kept on the invite so the inviter and the hosts can see it. Clearing it ("I'll pay
-- myself instead") sets it back to null. Safe to run once on top of the earlier migrations.

alter table public.invites add column if not exists pay_requested_at timestamptz;

-- Same lockdown as before: nothing for the public API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
grant execute on function public.hit_attempt(text, integer) to service_role;
grant execute on function public.add_no_taps(uuid, integer) to service_role;
grant usage, select on sequence public.event_id_seq to service_role;
