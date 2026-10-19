// Validation for every Phase 1 admin form. Field errors use the strings in content/copy.json.
import { z } from "zod";
import { t } from "@/lib/copy";
import { eventDates, fromLagos, lagosDate, MAX_EVENT_DAYS } from "@/lib/event";
import { nairaToKobo } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { CARD_FOILS, CARD_NOTE_MAX, CARD_PAPERS, CARD_SUBTITLE_MAX, CARD_THEMES, REVEAL_MODES, type EventDay, type EventRow, type RevealMode } from "@/lib/types";
import type { FieldErrors } from "@/lib/action";

type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const text = (max: number) => z.string().max(max);

/* ---------- Event settings ---------- */

export const eventInputSchema = z.object({
  name: text(200),
  date: text(10),
  time: text(5),
  end_date: text(10),
  days: z.array(z.object({ date: text(10), name: text(200), dress_code: text(200) })).max(MAX_EVENT_DAYS),
  venue_name: text(200),
  venue_address: text(300),
  dress_code: text(200),
  price: text(20),
  refund_text: text(600),
  capacity: text(10),
  hold_window_hours: text(10),
  unopened_expiry_days: text(10),
  invites_open: z.boolean(),
  reveal_date_mode: z.enum(REVEAL_MODES),
  reveal_date_at: text(16),
  reveal_venue_mode: z.enum(REVEAL_MODES),
  reveal_venue_at: text(16),
  card: z.object({
    theme: z.enum(CARD_THEMES),
    foil: z.enum(CARD_FOILS),
    paper: z.enum(CARD_PAPERS),
    note: text(200),
    subtitle: text(200).default(""),
  }),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export type EventPatch = Omit<EventRow, "id" | "reference_prefix" | "created_at">;


function wholeNumber(value: string, min: number, max: number): number | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** Longest hold for an unpaid invite: a year, in hours. */
export const MAX_HOLD_HOURS = 8760;

/** datetime-local value (YYYY-MM-DDTHH:MM) in Lagos time to UTC ISO. */
function fromLagosLocal(value: string): string | null {
  return value.length >= 16 ? fromLagos(value.slice(0, 10), value.slice(11, 16)) : null;
}

export function parseEventInput(raw: unknown): Parsed<EventPatch> {
  const shape = eventInputSchema.safeParse(raw);
  if (!shape.success) return { ok: false, errors: { form: t("admin.common.error_network") } };
  const input = shape.data;
  const errors: FieldErrors = {};

  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) errors.name = t("admin.event.errors.name");

  let startsAt: string | null = null;
  if (input.date || input.time) {
    startsAt = fromLagos(input.date, input.time);
    if (!startsAt) errors.date = t("admin.event.errors.date");
  }

  // Several days: the last day comes after the first, at most MAX_EVENT_DAYS days in all.
  let endDate: string | null = null;
  let days: EventDay[] = [];
  if (input.end_date) {
    const first = startsAt ? lagosDate(startsAt) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.end_date) || !first) errors.end_date = t("admin.event.errors.end_date");
    else if (input.end_date <= first) errors.end_date = t("admin.event.errors.end_date");
    else if (eventDates(startsAt, input.end_date).slice(-1)[0] !== input.end_date) errors.end_date = t("admin.event.errors.too_many_days", { n: MAX_EVENT_DAYS });
    else {
      endDate = input.end_date;
      const dates = new Set(eventDates(startsAt, endDate));
      days = input.days
        .map((d) => ({ date: d.date, name: d.name.trim().replace(/\s+/g, " "), dress_code: d.dress_code.trim() }))
        .filter((d) => dates.has(d.date) && (d.name || d.dress_code));
      days.forEach((d) => {
        if (d.name.length > 80) errors[`days.${d.date}.name`] = t("admin.event.errors.name");
      });
    }
  }

  const price = nairaToKobo(input.price || "0");
  if (price == null) errors.price = t("admin.event.errors.whole_number");

  let capacity: number | null = null;
  if (input.capacity.trim()) {
    const c = wholeNumber(input.capacity, 0, 100_000);
    if (c == null) errors.capacity = t("admin.event.errors.whole_number");
    else capacity = c === 0 ? null : c;
  }

  const hold = wholeNumber(input.hold_window_hours, 1, MAX_HOLD_HOURS);
  if (hold == null) errors.hold_window_hours = t("admin.event.errors.hold", { max: MAX_HOLD_HOURS });
  const unopened = wholeNumber(input.unopened_expiry_days, 1, 90);
  if (unopened == null) errors.unopened_expiry_days = t("admin.event.errors.whole_number");

  const reveal = (mode: RevealMode, at: string, field: string): string | null => {
    if (mode !== "at_time") return null;
    const iso = fromLagosLocal(at);
    if (!iso) errors[field] = t("admin.event.errors.reveal_at");
    return iso;
  };
  const revealDateAt = reveal(input.reveal_date_mode, input.reveal_date_at, "reveal_date_at");
  const revealVenueAt = reveal(input.reveal_venue_mode, input.reveal_venue_at, "reveal_venue_at");

  const note = input.card.note.trim().replace(/\s+/g, " ");
  if (note.length > CARD_NOTE_MAX) errors.card_note = t("admin.event.errors.card_note", { n: CARD_NOTE_MAX });
  const subtitle = input.card.subtitle.trim().replace(/\s+/g, " ");
  if (subtitle.length > CARD_SUBTITLE_MAX) errors.card_subtitle = t("admin.event.errors.card_subtitle", { n: CARD_SUBTITLE_MAX });

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      starts_at: startsAt,
      end_date: endDate,
      days,
      venue_name: input.venue_name.trim(),
      venue_address: input.venue_address.trim(),
      dress_code: input.dress_code.trim(),
      price_kobo: price as number,
      refund_text: input.refund_text.trim() || t("admin.event.refund_default"),
      capacity,
      hold_window_hours: hold as number,
      unopened_expiry_days: unopened as number,
      invites_open: input.invites_open,
      reveal_date_mode: input.reveal_date_mode,
      reveal_date_at: revealDateAt,
      reveal_venue_mode: input.reveal_venue_mode,
      reveal_venue_at: revealVenueAt,
      card: { theme: input.card.theme, foil: input.card.foil, paper: input.card.paper, note, subtitle },
    },
  };
}

/* ---------- Payout account ---------- */

export const accountInputSchema = z.object({
  bank_name: text(200),
  account_number: text(40),
  account_name: text(200),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

export function parseAccountInput(raw: unknown): Parsed<AccountInput> {
  const shape = accountInputSchema.safeParse(raw);
  if (!shape.success) return { ok: false, errors: { form: t("admin.common.error_network") } };
  const bank = shape.data.bank_name.trim().replace(/\s+/g, " ");
  const number = shape.data.account_number.replace(/\s+/g, "");
  const name = shape.data.account_name.trim().replace(/\s+/g, " ");
  const errors: FieldErrors = {};
  if (!bank || bank.length > 60) errors.bank_name = t("admin.account.errors.bank");
  if (!/^\d{10}$/.test(number)) errors.account_number = t("admin.account.errors.number");
  if (!name || name.length > 80) errors.account_name = t("admin.account.errors.name");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { bank_name: bank, account_number: number, account_name: name } };
}

/* ---------- Members ---------- */

export const memberInputSchema = z.object({
  first_name: text(200),
  phone: text(40),
  unlimited: z.boolean(),
  slots: text(6),
});
export type MemberInput = z.infer<typeof memberInputSchema>;

export type MemberValues = { first_name: string; phone_e164: string; slot_limit: number | null };

export function parseMemberInput(raw: unknown): Parsed<MemberValues> {
  const shape = memberInputSchema.safeParse(raw);
  if (!shape.success) return { ok: false, errors: { form: t("admin.common.error_network") } };
  const errors: FieldErrors = {};
  const firstName = shape.data.first_name.trim().replace(/\s+/g, " ");
  if (!firstName || firstName.length > 40) errors.first_name = t("member.new_invite.name_error");
  const phone = normalizePhone(shape.data.phone);
  if (!phone) errors.phone = t("member.new_invite.phone_error");
  const slots = shape.data.unlimited ? null : wholeNumber(shape.data.slots, 0, 500);
  if (!shape.data.unlimited && slots == null) errors.slots = t("admin.event.errors.whole_number");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { first_name: firstName, phone_e164: phone as string, slot_limit: slots } };
}

/** The slots select sends "u" for Unlimited or a whole number. */
export function parseSlotLimit(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === "u" || value === null) return { ok: true, value: null };
  const n = typeof value === "number" ? value : wholeNumber(String(value ?? ""), 0, 500);
  return n != null && Number.isInteger(n) && n >= 0 && n <= 500 ? { ok: true, value: n } : { ok: false };
}

/* ---------- Guests to invite ---------- */

export const MAX_GUESTS_PER_BATCH = 20;

export const guestRowsSchema = z
  .array(z.object({ first_name: text(200), phone: text(40), pay: z.boolean().optional() }))
  .min(1)
  .max(MAX_GUESTS_PER_BATCH);
export type GuestRowsInput = z.infer<typeof guestRowsSchema>;

/** Field errors are keyed rows.{i}.first_name and rows.{i}.phone. */
export function parseGuestRows(raw: unknown): Parsed<{ first_name: string; phone_e164: string; pay: boolean }[]> {
  const shape = guestRowsSchema.safeParse(raw);
  if (!shape.success) return { ok: false, errors: { form: t("member.new_invite.name_error") } };
  const errors: FieldErrors = {};
  const rows = shape.data.map((row, i) => {
    const firstName = row.first_name.trim().replace(/\s+/g, " ");
    if (!firstName || firstName.length > 40) errors[`rows.${i}.first_name`] = t("member.new_invite.name_error");
    const phone = normalizePhone(row.phone);
    if (!phone) errors[`rows.${i}.phone`] = t("member.new_invite.phone_error");
    return { first_name: firstName, phone_e164: phone ?? "", pay: row.pay === true };
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: rows };
}

/* ---------- Admins ---------- */

export const adminInputSchema = z.object({ first_name: text(200), email: text(320), phone: text(40) });
export type AdminInput = z.infer<typeof adminInputSchema>;

export function parseAdminInput(raw: unknown): Parsed<{ first_name: string; email: string; phone_e164: string }> {
  const shape = adminInputSchema.safeParse(raw);
  if (!shape.success) return { ok: false, errors: { form: t("admin.common.error_network") } };
  const errors: FieldErrors = {};
  const firstName = shape.data.first_name.trim().replace(/\s+/g, " ");
  if (!firstName || firstName.length > 40) errors.first_name = t("member.new_invite.name_error");
  const email = z.email().safeParse(shape.data.email.trim());
  if (!email.success) errors.email = t("admin.admins.errors.email");
  const phone = normalizePhone(shape.data.phone);
  if (!phone) errors.phone = t("member.new_invite.phone_error");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { first_name: firstName, email: (email.data as string).toLowerCase(), phone_e164: phone as string } };
}

/** A new password: at least 12 characters, typed the same twice. */
export function parseNewPassword(password: unknown, again: unknown): { ok: true; value: string } | { ok: false; errors: FieldErrors } {
  const p = typeof password === "string" ? password : "";
  const a = typeof again === "string" ? again : "";
  if (p.length < 12 || p.length > 200) return { ok: false, errors: { password: t("admin.setup.errors.short") } };
  if (p !== a) return { ok: false, errors: { again: t("admin.setup.errors.match") } };
  return { ok: true, value: p };
}

/* ---------- Events (superadmin) ---------- */

export const createEventSchema = z.object({ name: text(200), admin: adminInputSchema });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** A new event's name, and its admin when any of the admin's fields is filled in. */
export function parseCreateEvent(
  raw: unknown,
): Parsed<{ name: string; admin: { first_name: string; email: string; phone_e164: string } | null }> {
  const shape = createEventSchema.safeParse(raw);
  if (!shape.success) return { ok: false, errors: { form: t("admin.common.error_network") } };
  const errors: FieldErrors = {};
  const name = shape.data.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) errors.name = t("admin.events.errors.name");
  const a = shape.data.admin;
  const wantsAdmin = !!(a.first_name.trim() || a.email.trim() || a.phone.trim());
  let admin = null;
  if (wantsAdmin) {
    const parsed = parseAdminInput(a);
    if (!parsed.ok) Object.entries(parsed.errors).forEach(([k, v]) => (errors[`admin.${k}`] = v));
    else admin = parsed.value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, admin } };
}
