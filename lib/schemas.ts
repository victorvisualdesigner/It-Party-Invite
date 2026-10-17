// Validation for every Phase 1 admin form. Field errors use the strings in content/copy.json.
import { z } from "zod";
import { t } from "@/lib/copy";
import { fromLagos } from "@/lib/event";
import { nairaToKobo } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { REVEAL_MODES, type EventRow, type RevealMode } from "@/lib/types";
import type { FieldErrors } from "@/lib/action";

type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const text = (max: number) => z.string().max(max);

/* ---------- Event settings ---------- */

export const eventInputSchema = z.object({
  name: text(200),
  date: text(10),
  time: text(5),
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
});
export type EventInput = z.infer<typeof eventInputSchema>;

export type EventPatch = Omit<EventRow, "id" | "reference_prefix">;

function wholeNumber(value: string, min: number, max: number): number | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

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

  const price = nairaToKobo(input.price || "0");
  if (price == null) errors.price = t("admin.event.errors.whole_number");

  let capacity: number | null = null;
  if (input.capacity.trim()) {
    const c = wholeNumber(input.capacity, 0, 100_000);
    if (c == null) errors.capacity = t("admin.event.errors.whole_number");
    else capacity = c === 0 ? null : c;
  }

  const hold = wholeNumber(input.hold_window_hours, 1, 720);
  if (hold == null) errors.hold_window_hours = t("admin.event.errors.whole_number");
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

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      starts_at: startsAt,
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
