# Private Invite Platform: Build Spec

This file is the single source of truth for the build. Read it fully before writing code. When this file and your instincts disagree, this file wins. When this file is silent, choose the simplest option and say what you chose.

Supporting files in this kit:

| File | What it holds |
| --- | --- |
| `content/invite-messages.json` | The invite message library, assembly rules, card ready and reveal messages |
| `content/key-words.json` | Words and rules for access keys |
| `content/no-chase.json` | The No button deck, tiers, lines, idle behaviour, reduced motion |
| `content/copy.json` | Every UI string for the three interfaces |
| `design/tokens.css` | Colour, type, space, shape and motion tokens |
| `prototype/guest.html` | A working, self contained prototype of the guest experience. Port its look and motion faithfully. |
| `ui/` | The high fidelity design build of all three interfaces plus the Resistance Board, wired to a stand-in backend in the browser. Where it and `prototype/guest.html` differ, `ui/` is the newer design. See `ui/README.md`. |

---

## 1. What we are building

A private, paid, invite only party. The team ("members") invite guests through personal links. Each link opens only for the phone number it was made for. The guest sees a sealed envelope, unlocks it with their number and a key, reads a beautiful invite card, and is asked "So, are you coming?". The No button can never be pressed. Yes leads to a bank transfer. When the host confirms the transfer, the guest's premium invitation card unlocks. That card is the ticket.

### Product rules that are never broken

1. **No can never be pressed.** There is no decline flow, no decline state, no decline endpoint. A guest who does not want to come simply leaves.
2. **Yes only counts after payment is confirmed.** Headcount = invites in status `paid`. Nothing else is a guest.
3. **Nothing leaks before unlock.** Before a correct number and key, the server returns no event name, date, venue, price, inviter name, guest name or other guests. Not in HTML, not in JSON, not in meta tags, not in the page source.
4. **Only members and the admin invite.** Guests cannot invite anyone or bring anyone.
5. **No payment company and no SMS service.** Guests transfer directly to a bank account the admin adds. The admin confirms payments by hand. Messages are sent from the inviter's own WhatsApp (or SMS app) through deep links. The event pays no per message or per payment fees.
6. **Members cannot type or edit invite messages.** Messages come only from the library. Members can Shuffle.
7. **Transfer only.** No card payments anywhere.
8. **No refunds by default.** The admin can change the refund text in settings. The app never moves money itself.

---

## 2. Stack

- **Next.js** (App Router, TypeScript, server actions or route handlers) for all three interfaces in one app.
- **Supabase** Postgres for data. Use the service role key on the server only. Never query the database from the browser. Turn on Row Level Security on every table with no public policies, so a leaked anon key can read nothing.
- **Supabase Auth** (email and password) for the admin only. Members and guests use the phone plus key system in section 5.
- **Hosting:** any platform with a free tier that runs Next.js. Check that the plan's terms allow a small paid event.
- **Libraries:** `zod` for validation, `libphonenumber-js` for phone numbers (default region NG), `qrcode` for ticket QR codes, `jsqr` (or the browser's BarcodeDetector) for door scanning. Use Node's built in `crypto` for hashing (scrypt) and random values. No animation library on the guest page: CSS keyframes and the Web Animations API only.
- **Fonts:** Fraunces and Inter from Google Fonts with `display=swap`, two weights each, subset to Latin plus the naira sign.

### Environment variables

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=           # only for admin auth in the browser
APP_URL=                     # e.g. https://invite.example.com, used to build links
SESSION_SECRET=              # 32+ random bytes, signs session cookies
CRON_SECRET=                 # protects the expiry sweep route
```

---

## 3. Repository layout

```
app/
  i/[token]/page.tsx          Guest page (single route, all guest states)
  m/                          Member app (login, home, new invite, guest detail)
  admin/                      Admin portal (overview, guests, payments, members, invite, event, account, door)
  board/page.tsx              Resistance Board for a TV at the party
  api/...                     Route handlers where server actions don't fit
lib/
  db.ts                       Supabase server client
  phone.ts                    Normalize, validate and mask phone numbers
  keys.ts                     Generate, normalize, hash and verify access keys
  messages.ts                 Assemble invite messages from the library
  invites.ts                  Invite state machine and expiry logic
  payments.ts                 References, claims, confirm, not found
  session.ts                  Device sessions for guests and members
  ratelimit.ts                Attempt counting in Postgres
  whatsapp.ts                 wa.me and sms: link builders
content/                      The JSON files from this kit, imported as-is
design/tokens.css             Imported globally
public/og-envelope.png        1200x630 sealed envelope preview image
supabase/migrations/          SQL migrations
scripts/seed-admin.ts         Creates the first admin and the event row
```

---

## 4. Data model

Money is always stored in **kobo** as integers. Times are `timestamptz` in UTC and shown in Africa/Lagos time. All ids are UUIDs except where noted.

### `event` (exactly one row)

| Column | Type | Notes |
| --- | --- | --- |
| name | text | Admin sets it. Shown on the envelope and card after unlock. |
| starts_at | timestamptz | Date and start time |
| venue_name | text | |
| venue_address | text | |
| dress_code | text | |
| price_kobo | int | Ticket price |
| capacity | int null | Optional. Never shown to guests. |
| hold_window_hours | int | Default 72. Admin sets it. |
| unopened_expiry_days | int | Default 7. Admin sets it. |
| refund_text | text | Default "All payments are final. No refunds." |
| reveal_date_mode | text | `card`, `after_payment`, `at_time`, `hidden` |
| reveal_date_at | timestamptz null | Used when mode is `at_time` |
| reveal_venue_mode | text | Same options. Default `at_time`. |
| reveal_venue_at | timestamptz null | |
| invites_open | bool | When false, no new invites and no new payments |
| reference_prefix | text | Two letters derived from the event name, e.g. "DC" |

### `people` (members and admins)

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| role | text | `admin` or `member` |
| first_name | text | Used as {inviter} in messages |
| phone_e164 | text unique | |
| auth_user_id | uuid null | Supabase Auth user, admins only |
| slot_limit | int null | null means Unlimited. Admins are always Unlimited. |
| key_hash | text null | Member login key (scrypt hash with salt) |
| active | bool | Removed members are inactive, never deleted |
| created_at | timestamptz | |

### `invites`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| token | text unique | 22+ chars of URL safe randomness (16+ random bytes). The link is `APP_URL/i/{token}`. |
| inviter_id | uuid | references people |
| guest_first_name | text | |
| guest_phone_e164 | text | Unique among invites that are not `expired` or `cancelled` |
| key_hash | text | scrypt hash of the normalized key |
| key_plain_draft | text null | Only while `draft`. Nulled the moment the invite is sent. |
| message_combo | int[4] | Indexes into opening, pull, mystery, close. Unique per event. |
| key_line_index | int | |
| covered_line_index | int null | |
| status | text | See section 6 |
| no_taps | int | Default 0 |
| board_visible | bool | Default true. Guest can switch it off on their card. |
| sent_at | timestamptz null | |
| opened_at | timestamptz null | First successful unlock |
| yes_at | timestamptz null | |
| expires_at | timestamptz null | Current deadline. Null while awaiting confirmation or once paid. |
| hold_remaining_ms | bigint null | Saved when the clock pauses |
| covered | bool | True once a member payment is confirmed |
| wrong_attempts | int | Resets on success |
| locked_until | timestamptz null | Set after 5 wrong attempts |
| ticket_code | text unique null | Random, unguessable. Created when status becomes `paid`. Encoded in the QR. |
| checked_in_at | timestamptz null | |
| created_at | timestamptz | |

### `invite_devices`

| Column | Type | Notes |
| --- | --- | --- |
| invite_id | uuid | |
| secret_hash | text | sha256 of the device secret held in the cookie |
| user_agent | text | For the admin's eyes when resetting |
| created_at | timestamptz | |

At most **2** devices per invite. WhatsApp's in app browser and Chrome keep separate cookies, so one person on one phone can need two. A third device is refused with the "already claimed" screen until the inviter or admin resets access.

### `member_devices`

Same shape as `invite_devices`, keyed by person, at most 3 per member.

### `payout_accounts`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| bank_name | text | |
| account_number | text | 10 digits (NUBAN) |
| account_name | text | Shown to guests |
| active | bool | Exactly one active at a time |
| created_at | timestamptz | |

### `payments`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| invite_id | uuid | |
| payer_type | text | `guest` or `member` |
| payer_person_id | uuid null | When a member pays |
| reference | text unique | `{reference_prefix}{4 digits from 2 to 9}`, e.g. DC4827 |
| amount_kobo | int | Copied from the event at creation, never recalculated |
| account_id | uuid | The account shown to the payer. Never changes after creation. |
| status | text | `open` (sheet shown), `claimed` (I've sent it), `confirmed`, `not_found`, `void` |
| sender_name | text null | Typed by the payer |
| claimed_at, resolved_at | timestamptz null | |
| resolved_by | uuid null | Admin who confirmed or rejected |
| created_at | timestamptz | |

### `audit_log`

Every admin and member action and every guest state change: `actor_type`, `actor_id`, `invite_id`, `action`, `details jsonb`, `created_at`. The admin overview and funnel metrics read from here and from `invites`.

### `attempts`

For rate limiting by IP: `bucket` (e.g. `unlock:ip:1.2.3.4`), `count`, `window_start`.

---

## 5. Identity, keys and sessions

### Phone numbers

- Accept `0803 123 4567`, `803 123 4567`, `+234 803 123 4567`, `2348031234567`, and foreign numbers with a `+` and country code.
- Store E.164 (`+2348031234567`). Reject invalid numbers with a friendly message.
- Mask for display as local format with the middle hidden: `080•••••567` (first 3 and last 3 digits). Foreign numbers: country code, then dots, then last 3.

### Access keys

- Format `WORD DDDD`: one word from `content/key-words.json`, four digits from 2 to 9.
- Normalize before comparing: uppercase, strip everything except A to Z and 2 to 9.
- Store only a scrypt hash with a per row salt. The plain key exists only in the draft row and in the message the inviter sends.
- Resend and Reset access always generate a **new** key and invalidate the old one.

### Guest unlock

1. Guest submits phone and key to `POST /api/i/{token}/unlock`.
2. Server checks, in this order: invite exists and is not `cancelled` or `expired`; `locked_until` has passed; IP bucket under 30 attempts per hour; normalized phone equals `guest_phone_e164`; key verifies against `key_hash`.
3. On any failure, increment `wrong_attempts` and the IP bucket and return the same generic error. Never say which field was wrong. At 5 wrong attempts set `locked_until = now + 30 minutes` and reset the counter.
4. On success: if the invite already has 2 devices and this browser has no matching cookie, return `claimed_elsewhere`. Otherwise create a 32 byte random device secret, store its sha256 in `invite_devices`, set cookie `inv_{inviteIdShort}` (httpOnly, Secure, SameSite=Lax, path `/i/{token}`, max age 120 days). Set `opened_at` and start the hold clock if this is the first unlock.
5. A returning browser with a valid cookie skips the lock screen entirely.

### Members

Same mechanism: the admin adds a member's first name and phone, the system makes a key, and the admin sends it with one tap on WhatsApp. Member sessions use a signed httpOnly cookie, at most 3 devices, resettable by the admin.

### Admin

Supabase Auth email and password. `scripts/seed-admin.ts` creates the first admin (email, password, first name, phone) and the single `event` row. Every admin route and action checks for an admin session on the server.

---

## 6. Invite lifecycle

| Status | Meaning | Counts against slots | Counts as headcount |
| --- | --- | --- | --- |
| `draft` | Created, message previewed, not yet sent | No | No |
| `sent` | Inviter tapped Send | Yes | No |
| `opened` | Guest unlocked it at least once | Yes | No |
| `said_yes` | Guest tapped Yes and saw the transfer sheet | Yes | No |
| `awaiting_confirmation` | Guest (or inviter) tapped I've sent it | Yes | No |
| `paid` | Payment confirmed and guest has tapped Yes | Yes | **Yes** |
| `expired` | A deadline passed | No | No |
| `cancelled` | Inviter or admin cancelled | No | No |

`covered` is a flag, not a status. A covered invite still moves through `opened` and needs the guest's Yes. When a covered guest taps Yes, the invite goes straight to `paid`.

### Transitions and clocks

- `draft` → `sent`: inviter taps Send. Set `sent_at` and `expires_at = sent_at + unopened_expiry_days`. Null out `key_plain_draft`.
- `sent` → `opened`: first successful unlock. Set `opened_at` and `expires_at = opened_at + hold_window_hours`.
- `opened` → `said_yes`: guest taps Yes. Create a `payments` row (status `open`) with a new reference and the active account. Clock keeps running.
- `opened` → `paid`: guest taps Yes on a covered invite.
- `said_yes` → `awaiting_confirmation`: guest taps I've sent it and gives a sender name. Pause the clock: save `hold_remaining_ms = expires_at - now`, set `expires_at = null`.
- `awaiting_confirmation` → `paid`: admin confirms. Generate `ticket_code`.
- `awaiting_confirmation` → `said_yes`: admin marks Not found. Resume the clock: `expires_at = now + max(hold_remaining_ms, 6 hours)`.
- Any of `sent`, `opened`, `said_yes` → `expired` when `now > expires_at`. Covered invites never expire.
- Any status except `paid` → `cancelled`: inviter or admin cancels. Void any open payment.

Evaluate expiry **lazily on every read** of an invite (so correctness never depends on a scheduler), and also run a sweep at `POST /api/cron/expire` (protected by `CRON_SECRET`) every 15 minutes if the host supports cron.

### Slots and capacity

- Slots used by a person = their invites in `sent`, `opened`, `said_yes`, `awaiting_confirmation` or `paid`.
- If `slot_limit` is set and used ≥ limit, the person cannot send a new invite.
- If `capacity` is set, nobody (admin included) can send a new invite when `sent + opened + said_yes + awaiting + paid ≥ capacity`. Show `copy.member.new_invite.capacity_warning` when within 3 of the ceiling. The admin can raise capacity in settings.
- When `invites_open` is false, sending and new payments are blocked and the guest page shows `copy.guest.closed` to anyone not yet `paid`.

---

## 7. Flows

### 7.1 Creating and sending an invite (member or admin)

1. Inviter enters guest first name and phone. Validate the phone, check for an active invite on that number, check slots and capacity.
2. Server creates a `draft` invite with a token, a fresh key (plain kept in `key_plain_draft`), and an unused message combination (section 8).
3. Show the assembled message in a preview card with **Shuffle** (new combination, same key) and the toggle **I'm paying for them** (adds a covered line).
4. **Send on WhatsApp** marks the invite `sent` and opens `https://wa.me/{phone without +}?text={encoded message}`. One message carries the invite, link and key.
5. Under the main button: **Send by SMS instead** opens `sms:{phone}?body={encoded message}`, and **Copy message**.
6. If the inviter toggled I'm paying for them, show the member payment sheet right after sending (7.6).
7. Drafts older than 24 hours are deleted by the sweep. Drafts never consume slots or combinations permanently.

### 7.2 Guest opens the link

- `GET /i/{token}` is server rendered with generic Open Graph tags from `copy.guest.preview_card`, `og:image` = `/og-envelope.png`, and `<meta name="robots" content="noindex,nofollow">`. The HTML contains no event data.
- With a valid device cookie, the page loads the guest's state from the server and renders the right screen.
- Without one, it renders the lock screen with only the masked number. The masked number comes from the server; the full number never reaches the browser.
- Invalid token, cancelled or expired invites show the matching screen from `copy.guest`. Invalid tokens and claimed elsewhere show `copy.guest.stranger`.

### 7.3 The card and the question

After unlock: seal crack animation, then the card (salutation, inviter line, event name, date or "Revealed soon", venue reveal line, dress code, price or "Covered by {inviter}"). Then the question with Yes and No. The chase follows `content/no-chase.json` exactly. Port the behaviour from `prototype/guest.html`.

No taps are sent to `POST /api/i/{token}/no-tap` with a delta, debounced to at most one request every 400 ms. The server adds the delta (cap the delta at 20 per request to stop tampering). The count survives refresh because the client starts from the server's number.

### 7.4 Yes and the transfer

- If the invite is covered: go straight to `paid`, show `copy.guest.covered`, then the premium card.
- If a member payment is `claimed` but not yet confirmed: show "Your inviter is taking care of this" and the awaiting screen. Do not show the account.
- Otherwise: create or reuse the open payment and show the transfer sheet: amount, bank, account number, account name, reference, each with a Copy button, the hold countdown, and the refund text. The account details are fetched only here, after Yes.
- **I've sent it** asks for the sender's account name, then moves to `awaiting_confirmation`.
- **I'll pay later** closes the sheet and shows when the hold ends.

### 7.5 Admin confirms

- **Payments to confirm** lists every `claimed` payment, oldest first: guest name, who paid (guest or member name), amount, reference, sender name, time claimed.
- The page refreshes every 20 seconds (or uses Supabase Realtime) and shows a browser notification for new claims while the tab is open.
- Every Confirm button sits under the warning in `copy.admin.payments.warning`.
- **Confirm**: payment `confirmed`, invite `paid` (or `covered = true` for a member payment where the guest has not tapped Yes yet), generate `ticket_code`, write the audit log. Then offer **Tell {guest} on WhatsApp**, which opens `wa.me` with a line from `card_ready_messages`.
- **Not found**: payment `not_found`, invite back to `said_yes` with the clock resumed. The guest sees `copy.guest.not_found` next time they open the link.
- **Match a transfer without a reference**: search open and said_yes invites by guest name or amount, then confirm.
- Duplicate payments (guest and member both paid) are flagged in the queue. The admin confirms one and marks the other `void` with a note. Any refund is handled outside the app.

### 7.6 A member pays for their guest

- From the guest's detail in the Member app, **Pay for {guest}** creates a `member` payment with its own reference and shows the same transfer sheet.
- **I've sent it** sets the payment to `claimed` and puts it in the admin queue.
- On confirm: `covered = true`. If the guest already tapped Yes, the invite becomes `paid`. If not, it becomes `paid` the moment they do.

### 7.7 The guest is waiting

The awaiting screen polls `GET /api/i/{token}/state` every 10 seconds while visible (pause when hidden). When status becomes `paid`, play the payment landed moment and turn the card over to the premium card.

### 7.8 The premium card (the ticket)

Name, "Invited by {inviter}", event name, date and venue according to the reveal modes, dress code, a QR code encoding `ticket_code`, Save card (renders the card to a PNG in the browser), Add to calendar (an .ics download, only once the date is revealed), and the Resistance Board toggle.

### 7.9 Reveals

Date and venue are shown when their mode says so: `card` always after unlock, `after_payment` only to paid guests, `at_time` once that time passes, `hidden` never. When the admin reveals something, members see a **Tell them about the reveal** button per paid guest, which opens `wa.me` with a line from `reveal_messages`.

### 7.10 The door

- `/admin/door` scans QR codes with the phone camera (BarcodeDetector where available, `jsqr` otherwise) and has a name search.
- **Download the list for offline use** saves paid guests (name, inviter, ticket code) to IndexedDB, and the page works from that list when offline. Check ins made offline queue and sync when the connection returns.
- Results use `copy.admin.door`.

### 7.11 The Resistance Board

`/board` (admin session required) shows the top 10 paid guests by `no_taps` where `board_visible` is true, refreshing every 30 seconds, styled for a TV in landscape.

---

## 8. Invite messages

Read `content/invite-messages.json`. In `lib/messages.ts`:

1. Pick random indexes for opening, pull, mystery and close. Retry (up to 50 times) if that combination already exists on another invite. The unique index on `message_combo` is the final guard.
2. Pick a random key line. Pick a covered line only when the inviter is paying.
3. Fill `{guest}`, `{inviter}`, `{link}`, `{key}`. Assemble with the template in the file.
4. Assert in tests that every combination stays under 60 words without the covered line (and under 72 with it), using long names such as Oluwaseyifunmi and Chukwuemeka.
5. Never let a member edit message text. Shuffle is the only control.

---

## 9. Payments: references and safety

- Reference: `reference_prefix` + 4 digits from 2 to 9, unique across all payments. Shown large, with a Copy button and "Put this in the narration".
- Amount shown with the naira sign and thousands separators (`₦50,000`). The Copy button copies digits only (`50000`), because bank apps reject symbols.
- Account number is copied without spaces.
- An open payment keeps the account it was created with, even if the admin switches the active account.
- The app never claims a payment is received until an admin confirms it.

---

## 10. Interfaces and screens

### Guest page `/i/{token}`, mobile first, built for WhatsApp's in app browser

Screens: Lock, Stranger, Claimed elsewhere, Resting (locked out), Card and question, Transfer sheet, Pay later note, Awaiting, Not found, Covered, Premium card, Expired, Cancelled, Closed. All copy is in `copy.guest`.

Add a small "Open in browser" link (`copy.guest.in_app_browser`) at the bottom of every screen, shown only when the user agent looks like an in app browser.

### Member app `/m`, phone first

Screens: Login, Home (slot card and guest list with status chips and No tap counts), New invite (form, message preview, Shuffle, paying toggle, send buttons), Guest detail (status timeline, Send again, Reset access, Pay for guest, Cancel, reveal nudge), Member payment sheet. All copy is in `copy.member`.

### Admin portal `/admin`, laptop first but usable on a phone

Screens: Login, Overview (paid, awaiting, open invites, capacity, confirmed total, No taps, funnel from `audit_log`), Guests (table with filters by inviter and status, export CSV), Payments to confirm, Members (add, slots, send key, reset, remove), Invite someone (same flow as members), Event settings (all fields in section 4, reveal controls), Payout account, Door, link to the Board. All copy is in `copy.admin`.

---

## 11. Visual and motion direction

- Use `design/tokens.css` for every colour, size and duration. No raw hex values in components.
- The guest page is the hero. Match `prototype/guest.html`: the envelope arrival, the seal crack, the card sliding out, the name writing in, the chase moves, the gold confetti, the card turning over.
- Animate only `transform` and `opacity`. No animated shadows, blur, width or height.
- A tap anywhere skips a running animation. Nothing blocks input for more than one second.
- `prefers-reduced-motion: reduce` turns every animation into a cut or a short fade, and the No button follows `no-chase.json.reduced_motion`.
- Sound is off. No video backgrounds.
- The Member app and Admin portal share the tokens but are calm and fast: no decorative motion beyond quick transitions.

---

## 12. Performance and Nigerian context

- Guest page first load under **300 KB** compressed, fonts included. Measure it.
- It must feel instant on a throttled 3G connection on a budget Android phone (Tecno, Infinix or Itel class) inside WhatsApp.
- No client side data fetching libraries on the guest page. Plain `fetch`.
- Server render the lock screen so it paints before JavaScript loads.
- Inputs use `inputmode="tel"` for phone and `autocapitalize="characters"` for the key, font size at least 16px.
- Every network action shows a calm pending state and survives a dropped connection: retry on the next tap, never lose what the user typed.

---

## 13. Security checklist

- [ ] Nothing about the event or the guest is sent to the browser before unlock
- [ ] Tokens have at least 128 bits of randomness
- [ ] Keys and device secrets are stored hashed only
- [ ] Generic error for any unlock failure, per invite lockout after 5 tries, per IP limit of 30 an hour
- [ ] Device cookies are httpOnly, Secure, SameSite=Lax and scoped to the invite path
- [ ] All admin actions check the admin session on the server
- [ ] Members can only see and act on their own invites
- [ ] Row Level Security on every table with no public policies
- [ ] No-tap deltas are capped server side
- [ ] Ticket codes are random and unguessable, and a code can be checked in only once
- [ ] Payment amounts come from the server, never from the client
- [ ] `noindex` on every page

---

## 14. Build order

Build one phase at a time. At the end of each phase, run the checks and show the result before starting the next.

### Phase 1: Foundations
Project setup, tokens, fonts, database migrations, RLS, seed script, admin login, Event settings, Payout account, Members (add, slots, key, send key on WhatsApp).
**Checks:** admin can sign in, edit every event field, add an account and switch the active one, add a member with 3 slots and another with Unlimited, and the member key message opens WhatsApp to the right number.

### Phase 2: Invites
Member login, Member home, New invite with message assembly, Shuffle, paying toggle, WhatsApp and SMS send, Admin invite someone, slots and capacity rules, Guest detail, Send again, Reset access, Cancel.
**Checks:** a message never repeats a combination; slots block correctly; capacity blocks correctly; Send again changes the key; the plain key is gone from the database after sending.

### Phase 3: Guest page
Lock screen, unlock, device sessions, stranger and claimed elsewhere screens, lockout, card, question, the full No chase, no-tap tracking, Yes, transfer sheet, I've sent it, awaiting with polling, pay later.
**Checks:** view source before unlock shows no event data; wrong keys lock after 5; a third browser is refused; the chase never lets No be pressed with mouse, touch or keyboard; the tap count survives refresh; reduced motion works.

### Phase 4: Payments
Payments to confirm queue, Confirm, Not found, clock pause and resume, member payments and covered flow, duplicates, manual match, card ready WhatsApp message, expiry (lazy and sweep).
**Checks:** walk every row of the lifecycle table in section 6 with real clicks; an expired invite frees its slot; Not found resumes the clock with at least 6 hours.

### Phase 5: The card, reveals, door, board
Premium card with QR, Save card, Add to calendar, reveal modes and nudges, Door with camera scanning and offline list, Resistance Board, Guests export, Overview metrics.
**Checks:** a ticket scans once and is rejected the second time; the door works in airplane mode after download; reveals appear exactly when their mode says.

### Phase 6: Hardening
Rate limits, the full security checklist, accessibility pass (focus order, labels, contrast on cream and on green), performance budget, testing inside WhatsApp's browser on Android and iPhone, and on a throttled budget Android phone.

---

## 15. Do not

- Do not add a decline button, decline endpoint or decline status.
- Do not add card payments, a payment gateway, SMS providers or paid APIs.
- Do not let members type or edit invite messages.
- Do not show any event detail before unlock, including in meta tags.
- Do not store plain keys or device secrets after they are used.
- Do not use dashes between clauses in any user facing copy. Use the strings in `content/copy.json`.
- Do not invent new copy when a string exists. If a string is missing, write it in the same voice and add it to `copy.json`.
