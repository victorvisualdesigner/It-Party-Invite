# Phase 1 plan: foundations

Scope is CLAUDE.md section 14, Phase 1 only: project setup, tokens and fonts, the full database migration with RLS, the seed script, admin login, Event settings, Payout account, and Members. Nothing below has been built yet. This file is for approval.

---

## 1. Project setup

The folder already holds `CLAUDE.md`, `content/`, `design/`, `prototype/` and `ui/`, so `create-next-app` would refuse to run here. I will write the scaffold by hand (package.json, tsconfig, next.config) and install with npm. `ui/` and `prototype/` stay untouched as design references and are excluded from the TypeScript build.

```bash
git init
npm init -y
npm install next@16.4.2 react@19.3.1 react-dom@19.3.1 @supabase/supabase-js@2.118.0 @supabase/ssr@0.12.7 zod@4.6.7 libphonenumber-js@1.13.15
npm install -D typescript @types/node @types/react @types/react-dom tsx@4.23.15 vitest@5.0.5 supabase@2.121.0
```

TypeScript gets pinned to whatever Next 16 supports (5.9 if 7.x trips the build). `qrcode` and `jsqr` arrive in Phase 5, when they are first used.

npm scripts:

| Script | What it runs |
| --- | --- |
| `dev`, `build`, `start` | Next.js |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest unit tests |
| `db:push` | `supabase db push --db-url "$SUPABASE_DB_URL"` (applies `supabase/migrations/*.sql` in order and records them) |
| `seed:admin` | `tsx --env-file=.env.local scripts/seed-admin.ts` |
| `check:rls` | `tsx --env-file=.env.local scripts/check-rls.ts` |

Other setup files:

- `.env.example` with the six variables from section 2, plus `SUPABASE_DB_URL` (the Postgres connection string). Only `db:push` and `check:rls` read it. The app never does.
- `.gitignore` covering `.env*.local`, `node_modules`, `.next`.
- `next.config.ts` sends `X-Robots-Tag: noindex, nofollow` on every response, and the root layout adds the `robots` meta tag.
- `proxy.ts` (Next 16's name for middleware) refreshes the Supabase auth cookie on `/admin/*` and sends signed out visitors to `/admin/login`. It is a convenience only. Every page and every server action checks the admin session again on the server.
- `.claude/launch.json` gets an `app` entry for `npm run dev` on port 3000, next to the existing `design-build` entry.

### Tokens and fonts

- `design/tokens.css` is imported once in `app/layout.tsx`.
- The extra tokens at the top of `ui/assets/base.css` (`--paper-white`, `--wax-dark`, `--foil-light` and the rest) get promoted into `design/tokens.css`, as the README asks.
- `ui/assets/admin.css` uses raw hex values in places (`#FBF0D2`, `#E2C877`, `#5C4410`, `#24543F`, `#F5E6B8` and others). Section 11 forbids raw hex in components, so each one becomes a named token in `tokens.css` (for example `--honey-50`, `--honey-300`, `--honey-900`, `--green-650`).
- The paper grain that `kit.js` paints on a canvas at runtime becomes a static 140 by 140 `public/noise.png`. `--noise` points at it, so no script is needed for texture.
- Fonts come through `next/font/google`, which self hosts them at build time with `display: swap`. That means Fraunces 500 and 600 plus italic 500 (the cuts the design build uses), and Inter 400 and 600.
- Subsets are `latin` and `latin-ext`. Google's `latin` subset does not include the naira sign (U+20A6); `latin-ext` does. Each subset is a separate file behind a `unicode-range`, so a browser only downloads the `latin-ext` file on a page that actually shows ₦.

### Styling approach

Plain CSS, ported almost line for line from the design build. There is no Tailwind and no CSS in JS. `app/globals.css` holds `base.css` (buttons, fields, chips, dialogs, toast, envelope, seal), and `app/admin/admin.css` holds `admin.css`. Components render the same class names, so the screens match `ui/admin.html`. Icons, the wax seal SVG and the envelope are ported from `ui/assets/kit.js` into small React components.

---

## 2. The database migration

File: `supabase/migrations/0001_init.sql`. It covers every table in section 4, with RLS on and no policies. Two small database functions do the jobs that need a transaction: switching the active payout account, and capping devices per invite or member.

```sql
-- 0001_init.sql
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
```

Notes on the migration:

- **No decline anywhere.** There is no decline status, column or function.
- **`plain_key_only_in_draft`** makes the Phase 2 check ("the plain key is gone after sending") a database guarantee, not just app code.
- **`reveal_*_at` is not forced** when the mode is `at_time`. The seed creates the event before a date exists, so the database cannot require it yet. The settings form requires a reveal time when you pick "At a set time", and a missing time counts as not yet revealed.
- **`check:rls`** proves the lockdown two ways. It reads `pg_tables.rowsecurity` and `pg_policies` for every public table (all must be on, with zero policies), and it tries each table with the anon key (every read must fail).

---

## 3. Phase 1 admin screens and routes

| Route | Screen | Server actions | Matches in the design build |
| --- | --- | --- | --- |
| `/admin/login` | Host access: envelope art on green at left, form on cream at right | `signIn`, `signOut` | `login()` in `admin.js` |
| `/admin` | Redirects to `/admin/event` until Overview lands in Phase 5 | | |
| `/admin/event` | Event settings: four cards (The night, Money, Rules, Reveal controls), sticky save bar, live "What guests see" preview | `saveEvent` | `VIEWS.event` |
| `/admin/account` | Payout account: green bank cards with an Active chip, Make active, Add an account form | `addAccount`, `setActiveAccount` | `VIEWS.account` |
| `/admin/members` | Members: table (member, phone, invites used with meter, paid guests, actions), Add member dialog, key dialog with Send their key on WhatsApp, inline slots select, Make a new key, Remove member | `addMember`, `setSlots`, `resetMemberKey`, `removeMember` | `VIEWS.members`, `addMember()`, `keyDialog()` |

Shared shell (`app/admin/(portal)/layout.tsx`): the green sidebar with the seal mark, event name and "Host", nav, the invites open status line, and Sign out, beside the cream main area. The layout calls `requireAdmin()`. In Phase 1 the nav lists only the three built screens. Each later phase adds its own items.

How the screens behave:

- **Login.** Server action with `signInWithPassword`, using `@supabase/ssr` cookies. The anon key stays on the server and never ships to the browser. After auth, the server checks that a `people` row has `role = 'admin'`, `active = true` and this `auth_user_id`, or it signs the user out again. Any failure shows one generic error. The button shows a pending label while signing in.
- **Event settings.** Every field in section 4: name, date and start time, venue, venue address, dress code, price in naira (stored as kobo), refund rule, capacity, hold window, unopened expiry, invites open, and both reveal modes with their times. Dates and times are entered and shown in Africa/Lagos time (fixed UTC+1, no daylight saving) and stored in UTC. `reference_prefix` is derived from the name on save: the first letters of the first two words, or the first two letters of a single word (for example "Only Yes" gives OY). zod validates on the server, and errors show under each field.
- **Payout account.** The account number must be exactly 10 digits. Spaces are stripped on save and the number is shown grouped 4 3 3. The first account becomes active automatically. Make active calls `set_active_account`. The switch note from `copy.json` explains that guests already on the transfer screen keep their account.
- **Members.** Add a member with first name, phone, and slots (a fixed number or Unlimited). The server normalizes the phone with libphonenumber (default region NG) and rejects duplicates among active people. It makes a `WORD DDDD` key with `crypto.randomInt`, using words from `key-words.json` and digits 2 to 9, and stores only `scrypt$N$r$p$salt$hash`.
  - The plain key is returned once, to the dialog. It is never stored.
  - **Send their key on WhatsApp** is a plain link: `https://wa.me/{digits}?text={admin.members.key_message}`, with `{link}` set to `APP_URL/m`.
  - **Make a new key** replaces the hash and deletes that person's `member_devices`, which signs them out everywhere.
  - **Remove member** sets `active = false`, cancels their unpaid invites, voids open payments and deletes their devices. Paid guests stay.
  - Re-adding a removed member's number reactivates the same row with a new key, because `phone_e164` is unique.
  - The host row shows "Host", is always Unlimited, and cannot be removed.
- **Audit log.** Every action writes an `audit_log` row: `event_updated`, `account_added`, `account_switched`, `member_added`, `member_slots_changed`, `member_key_reset`, `member_removed`.
- **Pending states.** Every button shows a pending state. If the network drops, typed values stay in the form.

### Library modules built in Phase 1

`lib/db.ts` (service role client, `server-only`), `lib/auth.ts` (`requireAdmin`), `lib/copy.ts` (typed `t(path, vars)` over `content/copy.json`), `lib/phone.ts` (normalize, validate, mask, local format), `lib/keys.ts` (generate, normalize, hash, verify), `lib/whatsapp.ts` (`wa.me` and `sms:` builders), `lib/event.ts` (prefix, Lagos time, reveal helpers), `lib/money.ts` (kobo to `₦50,000` and digits only), `lib/audit.ts`.

### Seed script

`npm run seed:admin` prompts in your terminal for email, password (hidden as you type, at least 12 characters), first name, phone and event name. It then:

1. Creates the Supabase Auth user (email confirmed), or reuses one with that email.
2. Upserts the admin `people` row: role `admin`, Unlimited.
3. Inserts the single `event` row if it is missing, with the default refund text and a derived prefix.

It is safe to run twice and never prints the password.

### Copy

All strings come from `content/copy.json`. Strings that are missing get added in the same voice:

| Key | Text |
| --- | --- |
| `admin.login.error` | That email and password don't match. Try again. |
| `admin.login.submitting` | Signing in |
| `admin.common.saving` | Saving |
| `admin.common.error_network` | The connection dropped. Nothing you typed is lost. Try again. |
| `admin.account.errors.bank` | Add the bank name. |
| `admin.account.errors.number` | Account numbers have 10 digits. |
| `admin.account.errors.name` | Add the name guests will see. |
| `admin.account.added` | Account saved. |
| `admin.event.errors.name` | Add the event name. |
| `admin.event.errors.reveal_at` | Pick when to reveal it. |
| `admin.event.errors.whole_number` | Use a whole number. |

The three account errors already exist as hard coded text in `ui/assets/store.js`. They move into `copy.json`.

---

## 4. Decisions I made where the spec is silent

1. **The login page shows no event name.** `admin.login.body` ("The host portal for {event}.") and the event eyebrow are not rendered before sign in. `/admin/login` is reachable by anyone who has the domain from a forwarded guest link, and rule 3 says the event name never leaks before unlock. No new copy is needed: the title "Host access" stands alone. The prototype line is dropped.
2. **`/` returns 404.** There is nothing public to show.
3. **Drafts are excluded from the one-live-invite-per-phone index** (see the migration notes).
4. **Hosting is not part of Phase 1.** The checks run on `localhost:3000` against your hosted Supabase project. When we deploy, note that Vercel's free Hobby plan is for non-commercial use only, so a paid event should use a host whose free plan allows commercial use, such as Netlify. We will confirm the terms then.

---

## 5. What I need from you before the checks

1. **A Supabase project.** I recommend a separate free project for development. Test members cannot be deleted from the app (removal only deactivates them), so test data would otherwise sit in your live project.
2. **`.env.local` values.** Put `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or the new `sb_secret_` key), `SUPABASE_ANON_KEY` (or `sb_publishable_`) and `SUPABASE_DB_URL` (Project Settings > Database > connection string) into `.env.local` yourself. Please don't paste the service role key into chat. I will generate `SESSION_SECRET` and `CRON_SECRET` and set `APP_URL=http://localhost:3000`.
3. **Turn off sign ups.** In the Supabase dashboard, open Authentication > Sign In / Providers > Email and turn off "Allow new users to sign up".
4. **Run the seed yourself.** Run `npm run seed:admin` in your terminal. I can't type your password.
5. **Sign in once.** Sign in at `/admin/login` in the app's browser pane. After that I drive the checks with your session.

If you'd rather not share a database connection string, paste `0001_init.sql` into the Supabase SQL editor instead. `check:rls` then falls back to the anon key probes only.

---

## 6. How the Phase 1 checks will be shown

| Check | Proof |
| --- | --- |
| Admin can sign in | Screenshot of the portal after your sign in, and a wrong password showing the generic error |
| Edit every event field | I change every field in the browser, save, reload, and screenshot the persisted values. A database read then shows the same values, in UTC and kobo |
| Add an account and switch the active one | Add two accounts, switch, screenshot. A database read shows exactly one `active = true` |
| A member with 3 slots and another Unlimited | Add both in the browser, screenshot the table. A database read shows `slot_limit` of 3 and null, and `key_hash` starting `scrypt$` with no plain key anywhere |
| The member key message opens WhatsApp to the right number | Read the button's `href`: `https://wa.me/234…` with the member's number, and the decoded text equal to `key_message` with their name, `APP_URL/m` and the key from the dialog. Then open that link to show WhatsApp's chat page for that number. Nothing is sent |
| Extra | `npm run typecheck`, `npm test` (phone, keys, prefix, money, WhatsApp links) and `npm run build` all pass, plus `npm run check:rls` |
