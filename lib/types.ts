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
