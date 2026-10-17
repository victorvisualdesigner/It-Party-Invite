-- Guest flow, payments and door (Phases 2 to 6).
-- Atomic counters the API cannot do with plain updates, and one more guard on payments.

-- One live guest payment per invite, so a double tap on Yes can never open two.
create unique index payments_one_live_guest on public.payments (invite_id)
  where payer_type = 'guest' and status in ('open', 'claimed', 'not_found');
create index payments_status_idx on public.payments (status);

-- Rate limit buckets: count hits in a rolling window. Returns the count including this hit.
create function public.hit_attempt(p_bucket text, p_window_seconds integer) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  insert into public.attempts as a (bucket, count, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update set
    count = case when a.window_start < now() - make_interval(secs => p_window_seconds) then 1 else a.count + 1 end,
    window_start = case when a.window_start < now() - make_interval(secs => p_window_seconds) then now() else a.window_start end
  returning a.count into n;
  return n;
end $$;

-- No taps: add a capped delta. Returns the new total, or null for an invite that cannot take taps.
create function public.add_no_taps(p_invite_id uuid, p_delta integer) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  update public.invites
     set no_taps = no_taps + least(greatest(coalesce(p_delta, 0), 0), 20)
   where id = p_invite_id and status not in ('draft', 'cancelled', 'expired')
  returning no_taps into n;
  return n;
end $$;

-- Same lockdown as the first migration: nothing for the public API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
grant execute on function public.hit_attempt(text, integer) to service_role;
grant execute on function public.add_no_taps(uuid, integer) to service_role;
