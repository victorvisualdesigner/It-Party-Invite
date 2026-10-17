-- Initial schema (Phase 1): every table in CLAUDE.md section 4.
-- Every table has Row Level Security on and no policies, so only the service role
-- (server side) can read or write. Money is kobo. Times are timestamptz (UTC).

-- Event: exactly one row, pinned to id 1.
create table public.event (
  id                    smallint primary key default 1 check (id = 1),
  name                  text not null check (length(btrim(name)) between 1 and 80),
  starts_at             timestamptz,
  venue_name            text not null default '',
  venue_address         text not null default '',
  dress_code            text not null default '',
  price_kobo            integer not null default 0 check (price_kobo >= 0),
  capacity              integer check (capacity is null or capacity > 0),
  hold_window_hours     integer not null default 72 check (hold_window_hours between 1 and 720),
  unopened_expiry_days  integer not null default 7 check (unopened_expiry_days between 1 and 90),
  refund_text           text not null default 'All payments are final. No refunds.',
  reveal_date_mode      text not null default 'card'
                        check (reveal_date_mode in ('card', 'after_payment', 'at_time', 'hidden')),
  reveal_date_at        timestamptz,
  reveal_venue_mode     text not null default 'at_time'
                        check (reveal_venue_mode in ('card', 'after_payment', 'at_time', 'hidden')),
  reveal_venue_at       timestamptz,
  invites_open          boolean not null default true,
  reference_prefix      text not null default 'OY' check (reference_prefix ~ '^[A-Z]{2}$')
);

-- Members and admins.
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  role          text not null check (role in ('admin', 'member')),
  first_name    text not null check (length(btrim(first_name)) between 1 and 40),
  phone_e164    text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  slot_limit    integer check (slot_limit is null or slot_limit >= 0),
  key_hash      text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint admins_are_unlimited check (role <> 'admin' or slot_limit is null)
);

-- Invites.
create table public.invites (
  id                  uuid primary key default gen_random_uuid(),
  token               text not null unique check (length(token) >= 22),
  inviter_id          uuid not null references public.people (id),
  guest_first_name    text not null check (length(btrim(guest_first_name)) between 1 and 40),
  guest_phone_e164    text not null check (guest_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  key_hash            text not null,
  key_plain_draft     text,
  message_combo       integer[] not null check (cardinality(message_combo) = 4),
  key_line_index      integer not null,
  covered_line_index  integer,
  status              text not null default 'draft' check (status in (
                        'draft', 'sent', 'opened', 'said_yes',
                        'awaiting_confirmation', 'paid', 'expired', 'cancelled')),
  no_taps             integer not null default 0 check (no_taps >= 0),
  board_visible       boolean not null default true,
  sent_at             timestamptz,
  opened_at           timestamptz,
  yes_at              timestamptz,
  expires_at          timestamptz,
  hold_remaining_ms   bigint,
  covered             boolean not null default false,
  wrong_attempts      integer not null default 0,
  locked_until        timestamptz,
  ticket_code         text unique,
  checked_in_at       timestamptz,
  created_at          timestamptz not null default now(),
  -- The plain key can only exist on a draft. Sending must null it, or the update fails.
  constraint plain_key_only_in_draft check (status = 'draft' or key_plain_draft is null),
  constraint ticket_only_when_paid check (ticket_code is null or status = 'paid')
);
-- One live invite per phone number. Drafts are left out so an abandoned draft never blocks a
-- number; the draft-to-sent update is the guard.
create unique index invites_one_live_per_phone on public.invites (guest_phone_e164)
  where status not in ('draft', 'expired', 'cancelled');
-- A message combination is never used twice (single event, so unique across the table).
create unique index invites_message_combo_unique on public.invites (message_combo);
create index invites_inviter_idx on public.invites (inviter_id);
create index invites_status_expiry_idx on public.invites (status, expires_at);

-- Device sessions. Only the sha256 of the cookie secret is stored.
create table public.invite_devices (
  id           uuid primary key default gen_random_uuid(),
  invite_id    uuid not null references public.invites (id) on delete cascade,
  secret_hash  text not null unique,
  user_agent   text not null default '',
  created_at   timestamptz not null default now()
);
create index invite_devices_invite_idx on public.invite_devices (invite_id);

create table public.member_devices (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people (id) on delete cascade,
  secret_hash  text not null unique,
  user_agent   text not null default '',
  created_at   timestamptz not null default now()
);
create index member_devices_person_idx on public.member_devices (person_id);

-- Payout accounts. At most one active, enforced by the database.
create table public.payout_accounts (
  id              uuid primary key default gen_random_uuid(),
  bank_name       text not null check (length(btrim(bank_name)) between 1 and 60),
  account_number  text not null check (account_number ~ '^[0-9]{10}$'),
  account_name    text not null check (length(btrim(account_name)) between 1 and 80),
  active          boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index payout_accounts_one_active on public.payout_accounts (active) where active;

-- Payments. Amount and account are copied at creation and never change.
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  invite_id        uuid not null references public.invites (id),
  payer_type       text not null check (payer_type in ('guest', 'member')),
  payer_person_id  uuid references public.people (id),
  reference        text not null unique check (reference ~ '^[A-Z]{2}[2-9]{4}$'),
  amount_kobo      integer not null check (amount_kobo > 0),
  account_id       uuid not null references public.payout_accounts (id),
  status           text not null default 'open'
                   check (status in ('open', 'claimed', 'confirmed', 'not_found', 'void')),
  sender_name      text,
  claimed_at       timestamptz,
  resolved_at      timestamptz,
  resolved_by      uuid references public.people (id),
  created_at       timestamptz not null default now(),
  constraint member_payer_named check ((payer_type = 'member') = (payer_person_id is not null))
);
create index payments_invite_idx on public.payments (invite_id);
create index payments_claimed_idx on public.payments (claimed_at) where status = 'claimed';

-- Audit log: every admin and member action and every guest state change.
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_type  text not null check (actor_type in ('admin', 'member', 'guest', 'system')),
  actor_id    uuid references public.people (id),
  invite_id   uuid references public.invites (id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_invite_idx on public.audit_log (invite_id);

-- Rate limit buckets, e.g. 'unlock:ip:1.2.3.4'.
create table public.attempts (
  bucket        text primary key,
  count         integer not null default 0,
  window_start  timestamptz not null default now()
);

-- Switch the active payout account in one transaction.
create function public.set_active_account(p_account_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.payout_accounts where id = p_account_id) then
    raise exception 'account_not_found';
  end if;
  update public.payout_accounts set active = false where active and id <> p_account_id;
  update public.payout_accounts set active = true where id = p_account_id;
end $$;

-- Device caps: 2 per invite, 3 per member. The parent row is locked so two browsers
-- unlocking at the same moment cannot both squeeze in.
create function public.enforce_invite_device_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.invites where id = new.invite_id for update;
  if (select count(*) from public.invite_devices where invite_id = new.invite_id) >= 2 then
    raise exception 'device_limit';
  end if;
  return new;
end $$;
create trigger invite_devices_limit before insert on public.invite_devices
  for each row execute function public.enforce_invite_device_limit();

create function public.enforce_member_device_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.people where id = new.person_id for update;
  if (select count(*) from public.member_devices where person_id = new.person_id) >= 3 then
    raise exception 'device_limit';
  end if;
  return new;
end $$;
create trigger member_devices_limit before insert on public.member_devices
  for each row execute function public.enforce_member_device_limit();

-- Lock everything down. RLS on, no policies, no grants to the public API roles.
alter table public.event            enable row level security;
alter table public.people           enable row level security;
alter table public.invites          enable row level security;
alter table public.invite_devices   enable row level security;
alter table public.member_devices   enable row level security;
alter table public.payout_accounts  enable row level security;
alter table public.payments         enable row level security;
alter table public.audit_log        enable row level security;
alter table public.attempts         enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.set_active_account(uuid) to service_role;
