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

export const CARD_THEMES = ["emerald", "midnight", "wine", "onyx"] as const;
export const CARD_FOILS = ["gold", "silver", "rose"] as const;
export const CARD_PAPERS = ["cream", "white", "blush"] as const;

/** How the guest's card looks. Each event picks its own. */
export type CardDesign = {
  theme: (typeof CARD_THEMES)[number];
  foil: (typeof CARD_FOILS)[number];
  paper: (typeof CARD_PAPERS)[number];
  /** A short line on the card, such as "Champagne on arrival". Empty for none. */
  note: string;
  /** An optional line under the event name, such as "An evening in white". Empty for none. */
  subtitle: string;
};

/** The longest card note. Room for one line on a phone. */
export const CARD_NOTE_MAX = 80;

/** The longest line under the event name. */
export const CARD_SUBTITLE_MAX = 60;

export const DEFAULT_CARD: CardDesign = { theme: "emerald", foil: "gold", paper: "cream", note: "", subtitle: "" };

/** Fills any missing or unknown choice with the default, so an old or odd row still renders. */
export function cardDesign(raw: unknown): CardDesign {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof CardDesign, unknown>>;
  const pick = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] =>
    typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : d;
  return {
    theme: pick(CARD_THEMES, c.theme, DEFAULT_CARD.theme),
    foil: pick(CARD_FOILS, c.foil, DEFAULT_CARD.foil),
    paper: pick(CARD_PAPERS, c.paper, DEFAULT_CARD.paper),
    note: typeof c.note === "string" ? c.note.slice(0, CARD_NOTE_MAX) : "",
    subtitle: typeof c.subtitle === "string" ? c.subtitle.slice(0, CARD_SUBTITLE_MAX) : "",
  };
}

/** One day of a multi-day event. Empty name or dress code falls back to the event's own. */
export type EventDay = { date: string; name: string; dress_code: string };

export type EventRow = {
  id: number;
  name: string;
  starts_at: string | null;
  /** Last day (Lagos calendar date, YYYY-MM-DD) when the event runs over several days. */
  end_date: string | null;
  days: EventDay[];
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
  card: CardDesign;
  created_at?: string;
};

export type Role = "superadmin" | "admin" | "member";

/** Hosts (the superadmin and admins) invite without limits and sign in to the portal. */
export function isHost(role: Role): boolean {
  return role !== "member";
}

export type Person = {
  id: string;
  role: Role;
  /** The event this person belongs to. Null only for the superadmin, who sees every event. */
  event_id: number | null;
  first_name: string;
  phone_e164: string;
  auth_user_id: string | null;
  slot_limit: number | null;
  key_hash: string | null;
  active: boolean;
  created_at: string;
  email?: string | null;
  setup_hash?: string | null;
  setup_expires_at?: string | null;
};

export type PayoutAccount = {
  id: string;
  event_id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  active: boolean;
  created_at: string;
  archived_at?: string | null;
};

export type ActorType = "admin" | "member" | "guest" | "system";

/** Statuses a deadline can expire. */
export const EXPIRABLE_STATUSES: InviteStatus[] = ["sent", "opened", "said_yes"];

export type Invite = {
  id: string;
  event_id: number;
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
  /** When the guest said, on the transfer screen, that their inviter is paying. Null otherwise. */
  pay_requested_at: string | null;
  wrong_attempts: number;
  locked_until: string | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
};

export type PaymentStatus = "open" | "claimed" | "confirmed" | "not_found" | "void";

export type Payment = {
  id: string;
  event_id: number;
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
