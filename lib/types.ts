// Row shapes for the tables in supabase/migrations. Times arrive from Postgres as ISO strings.

export const REVEAL_MODES = ["card", "after_payment", "at_time", "hidden"] as const;
export type RevealMode = (typeof REVEAL_MODES)[number];

export const INVITE_STATUSES = [
  "draft",
  "sent",
  "opened",
  "said_yes",
  "awaiting_confirmation",
  "paid",
  "expired",
  "cancelled",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Statuses that hold a slot and count towards capacity. */
export const SLOT_STATUSES: InviteStatus[] = ["sent", "opened", "said_yes", "awaiting_confirmation", "paid"];

export type EventRow = {
  id: number;
  name: string;
  starts_at: string | null;
  venue_name: string;
  venue_address: string;
  dress_code: string;
  price_kobo: number;
  capacity: number | null;
  hold_window_hours: number;
  unopened_expiry_days: number;
  refund_text: string;
  reveal_date_mode: RevealMode;
  reveal_date_at: string | null;
  reveal_venue_mode: RevealMode;
  reveal_venue_at: string | null;
  invites_open: boolean;
  reference_prefix: string;
};

export type Person = {
  id: string;
  role: "admin" | "member";
  first_name: string;
  phone_e164: string;
  auth_user_id: string | null;
  slot_limit: number | null;
  key_hash: string | null;
  active: boolean;
  created_at: string;
};

export type PayoutAccount = {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  active: boolean;
  created_at: string;
};

export type ActorType = "admin" | "member" | "guest" | "system";

/** Statuses a deadline can expire. */
export const EXPIRABLE_STATUSES: InviteStatus[] = ["sent", "opened", "said_yes"];

export type Invite = {
  id: string;
  token: string;
  inviter_id: string;
  guest_first_name: string;
  guest_phone_e164: string;
  key_hash: string;
  key_plain_draft: string | null;
  message_combo: number[];
  key_line_index: number;
  covered_line_index: number | null;
  status: InviteStatus;
  no_taps: number;
  board_visible: boolean;
  sent_at: string | null;
  opened_at: string | null;
  yes_at: string | null;
  expires_at: string | null;
  hold_remaining_ms: number | null;
  covered: boolean;
  wrong_attempts: number;
  locked_until: string | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
};

export type PaymentStatus = "open" | "claimed" | "confirmed" | "not_found" | "void";

export type Payment = {
  id: string;
  invite_id: string;
  payer_type: "guest" | "member";
  payer_person_id: string | null;
  reference: string;
  amount_kobo: number;
  account_id: string;
  status: PaymentStatus;
  sender_name: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};
