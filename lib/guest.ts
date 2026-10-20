// What the guest page may know, screen by screen. Before a correct number and key, only the masked
// number (or a screen with no details) leaves the server.
import "server-only";
import { ASK_STATUSES, askAllowed, canAskInviter, inviterPayPath, isAskingInviter } from "@/lib/ask-inviter";
import { audit } from "@/lib/audit";
import { t } from "@/lib/copy";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { daysDiffer, eventDays, formatEventWhen, isRevealed, revealHint } from "@/lib/event";
import { pausedClock, refreshExpiry } from "@/lib/invites";
import { balanceKobo, partBounds } from "@/lib/installments";
import { verifyKey } from "@/lib/keys";
import { askInviterMessage } from "@/lib/messages";
import { formatNaira, nairaDigits } from "@/lib/money";
import { liveGuestPayment, liveMemberPayment, openGuestPayment, paidByCover, paidSoFar, paymentView, type PaymentView } from "@/lib/payments";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { seatPrice } from "@/lib/price";
import { getEvent } from "@/lib/settings";
import { addInviteDevice } from "@/lib/session";
import { ticketQrSvg } from "@/lib/tickets";
import type { CardDesign, EventRow, Invite, Payment, Role } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

const MINUTE = 60e3;
const HOUR = 3600e3;
export const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * MINUTE;

/**
 * One day of a multi-day event, as the guest may see it. The card shows the day's number in a
 * circle beside its name; the date stays null until it is revealed and is only used for the calendar.
 */
export type GuestDay = { date: string | null; number: number; label: string; name: string; dress: string };

export type EventView = {
  name: string;
  date: string | null;
  starts_at: string | null;
  /** Every day when the event runs over several days, otherwise empty. */
  days: GuestDay[];
  /** True when some day has its own name or dress code, so the card lists the days. */
  days_differ: boolean;
  venue: string | null;
  venue_address: string | null;
  venue_hint: string;
  dress: string;
  price: string;
  refund: string;
  /** The look this event chose for the card: theme, foil, paper and a short note. */
  card: CardDesign;
};

export type GuestView =
  | { screen: "stranger" }
  | { screen: "claimed" }
  | { screen: "lock"; masked: string }
  | { screen: "rest"; minutes: number }
  | { screen: "cancelled" }
  | { screen: "expired"; inviter: string | null }
  | ({
      screen: "card" | "held" | "wait" | "asked" | "notfound" | "covered" | "ticket" | "closed";
      guest: string;
      inviter: string;
      event: EventView;
      status: Invite["status"];
      covered: boolean;
      taps: number;
      hold_ends: string | null;
      payment: PaymentView | null;
      by_member: boolean;
      /** On the asked screen only: opens WhatsApp to the inviter with a line from the library. */
      ask_href: string | null;
      /** Pay small small, when the event allows it and the guest has not paid in full. */
      parts: PartsView | null;
      /** This guest gets the black and gold VIP card. */
      vip: boolean;
      /** The guest may say their inviter is paying. A host can turn it off, or turn a request down. */
      can_ask: boolean;
      /** A host turned down their request for the inviter to pay. They pay themselves now. */
      ask_rejected: boolean;
      ticket_code: string | null;
      qr: string | null;
    });

/** What a guest paying in parts sees: what is in, what is left, and the smallest part they can send. */
export type PartsView = {
  paid: string | null;
  paid_digits: string;
  price: string;
  price_digits: string;
  balance: string;
  balance_digits: string;
  min: string;
  min_digits: string;
};

export function partsView(priceKobo: number, paidKobo: number): PartsView {
  const balance = balanceKobo(priceKobo, paidKobo);
  const { min } = partBounds(balance);
  return {
    paid: paidKobo > 0 ? formatNaira(paidKobo) : null,
    paid_digits: nairaDigits(paidKobo),
    price: formatNaira(priceKobo),
    price_digits: nairaDigits(priceKobo),
    balance: formatNaira(balance),
    balance_digits: nairaDigits(balance),
    min: formatNaira(min),
    min_digits: nairaDigits(min),
  };
}

export function eventView(e: EventRow, paid: boolean, priceKobo: number = e.price_kobo): EventView {
  const dateShown = isRevealed(e.reveal_date_mode, e.reveal_date_at, paid) && !!e.starts_at;
  const venueShown = isRevealed(e.reveal_venue_mode, e.reveal_venue_at, paid);
  const days = eventDays(e);
  return {
    name: e.name,
    date: dateShown ? formatEventWhen(e.starts_at as string, e.end_date) : null,
    starts_at: dateShown ? e.starts_at : null,
    days: days.map((d) => ({
      date: dateShown ? d.date : null,
      number: d.number,
      label: dateShown ? d.label : t("guest.card.day_n", { n: d.number }),
      name: d.name,
      dress: d.dress,
    })),
    days_differ: daysDiffer(days, e),
    venue: venueShown ? e.venue_name : null,
    venue_address: venueShown ? e.venue_address : null,
    venue_hint: revealHint(e.reveal_venue_mode, e.reveal_venue_at, e.starts_at),
    dress: e.dress_code,
    price: formatNaira(priceKobo),
    refund: e.refund_text,
    card: e.card,
  };
}

type InviterRow = { first_name: string; phone_e164: string; role: Role };

async function inviterOf(inv: Invite): Promise<InviterRow | null> {
  const { data } = await db().from("people").select("first_name, phone_e164, role").eq("id", inv.inviter_id).maybeSingle();
  return (data as InviterRow | null) ?? null;
}

async function inviterName(inv: Invite): Promise<string> {
  return (await inviterOf(inv))?.first_name ?? "";
}

/** The WhatsApp line the guest sends to ask their inviter to pay. Same line on every poll. */
function askHref(inv: Invite, inviter: InviterRow | null): string | null {
  if (!inviter?.phone_e164) return null;
  const text = askInviterMessage(inviter.first_name, inv.guest_first_name, appUrl(inviterPayPath(inviter.role)), Date.parse(inv.pay_requested_at ?? "") || 0);
  return waLink(inviter.phone_e164, text);
}

/** The state for one invite and one browser. `mine` means this browser holds a matching device cookie. */
export async function guestState(inv: Invite | null, mine: boolean): Promise<GuestView> {
  if (!inv || inv.status === "draft") return { screen: "stranger" };
  inv = await refreshExpiry(inv);
  if (inv.status === "cancelled") return { screen: "cancelled" };
  if (inv.status === "expired") return { screen: "expired", inviter: mine ? await inviterName(inv) : null };
  if (!mine) {
    if (inv.locked_until && Date.parse(inv.locked_until) > Date.now()) {
      return { screen: "rest", minutes: Math.ceil((Date.parse(inv.locked_until) - Date.now()) / MINUTE) };
    }
    return { screen: "lock", masked: maskPhone(inv.guest_phone_e164) };
  }

  const event = await getEvent(inv.event_id);
  const paid = inv.status === "paid";
  const inviter = await inviterOf(inv);
  const base = {
    guest: inv.guest_first_name,
    inviter: inviter?.first_name ?? "",
    event: eventView(event, paid, seatPrice(inv, event)),
    status: inv.status,
    covered: inv.covered,
    taps: inv.no_taps,
    hold_ends: inv.expires_at,
    payment: null as PaymentView | null,
    by_member: false,
    ask_href: null as string | null,
    parts: null as PartsView | null,
    vip: !!inv.vip,
    can_ask: askAllowed(inv),
    ask_rejected: !!inv.pay_request_rejected_at && !paid,
    ticket_code: paid ? inv.ticket_code : null,
    qr: paid && inv.ticket_code ? await ticketQrSvg(inv.ticket_code) : null,
  };
  if (paid) return { screen: "ticket", ...base };
  if (!event.invites_open) return { screen: "closed", ...base };

  const p = await liveGuestPayment(inv.id);
  if (p) base.payment = await paymentView(p);
  const paidKobo = event.installments && !inv.covered ? await paidSoFar(inv.id) : 0;
  const price = seatPrice(inv, event);
  if (event.installments && !inv.covered && price > 0) base.parts = partsView(price, paidKobo);
  // Their inviter sent a transfer for them and the host is checking it: no account details, just wait.
  const mp = await liveMemberPayment(inv.id);
  if (mp?.status === "claimed" && inv.yes_at && p?.status !== "claimed") return { screen: "wait", ...base, by_member: true };
  if (inv.status === "awaiting_confirmation") return { screen: "wait", ...base };
  // The guest said their inviter is paying. The hold clock keeps running while they wait.
  if (isAskingInviter(inv)) return { screen: "asked", ...base, ask_href: askHref(inv, inviter) };
  if (inv.status === "said_yes" && p?.status === "not_found") return { screen: "notfound", ...base };
  // Said Yes and has transfer details but hasn't paid: their seat is saved, and the page opens on paying.
  if (inv.status === "said_yes" && (p?.status === "open" || paidKobo > 0)) return { screen: "held", ...base };
  return { screen: "card", ...base };
}

export type UnlockResult =
  | { kind: "ok"; secret: string | null }
  | { kind: "wrong"; attemptsLeft: number }
  | { kind: "locked"; minutes: number }
  | { kind: "stranger" }
  | { kind: "claimed" };

/**
 * Checks, in this order: the invite is live, it is not resting, the number matches, the key matches.
 * Any failure counts against the invite and gets the same answer. The IP limit is checked by the caller.
 */
export async function unlock(inv: Invite | null, phone: string, key: string, alreadyMine: boolean, userAgent: string): Promise<UnlockResult> {
  if (!inv || ["draft", "cancelled", "expired"].includes(inv.status)) return { kind: "stranger" };
  const now = Date.now();
  if (inv.locked_until && Date.parse(inv.locked_until) > now) {
    return { kind: "locked", minutes: Math.ceil((Date.parse(inv.locked_until) - now) / MINUTE) };
  }
  const match = normalizePhone(phone) === inv.guest_phone_e164 && (await verifyKey(key, inv.key_hash));
  if (!match) {
    const attempts = inv.wrong_attempts + 1;
    if (attempts >= LOCKOUT_ATTEMPTS) {
      await db()
        .from("invites")
        .update({ wrong_attempts: 0, locked_until: new Date(now + LOCKOUT_MS).toISOString() })
        .eq("id", inv.id);
      await audit("guest", null, "wrong_attempt", { locked: true }, inv.id);
      return { kind: "locked", minutes: 30 };
    }
    await db().from("invites").update({ wrong_attempts: attempts }).eq("id", inv.id);
    await audit("guest", null, "wrong_attempt", {}, inv.id);
    return { kind: "wrong", attemptsLeft: LOCKOUT_ATTEMPTS - attempts };
  }

  let secret: string | null = null;
  if (!alreadyMine) {
    secret = await addInviteDevice(inv.id, userAgent);
    if (!secret) return { kind: "claimed" };
  }
  const updates: Record<string, unknown> = { wrong_attempts: 0, locked_until: null };
  if (!inv.opened_at) {
    updates.opened_at = new Date(now).toISOString();
    if (inv.status === "sent") {
      const event = await getEvent(inv.event_id);
      updates.status = "opened";
      if (!inv.covered) updates.expires_at = new Date(now + event.hold_window_hours * HOUR).toISOString();
    }
  }
  await db().from("invites").update(updates).eq("id", inv.id);
  if (updates.opened_at) await audit("guest", null, "opened", {}, inv.id);
  return { kind: "ok", secret };
}

export type YesResult =
  | { kind: "payment"; payment: PaymentView }
  | { kind: "covered" }
  | { kind: "paid" }
  | { kind: "no_account" }
  | { kind: "refresh" };

/** The guest tapped Yes. Covered or free invites go straight to paid; everyone else gets the transfer sheet. */
export async function sayYes(inv: Invite): Promise<YesResult> {
  if (!["opened", "said_yes"].includes(inv.status)) return { kind: "refresh" };
  const event = await getEvent(inv.event_id);
  if (!event.invites_open) return { kind: "refresh" };
  const yesAt = inv.yes_at ?? new Date().toISOString();
  if (!inv.yes_at) await db().from("invites").update({ yes_at: yesAt }).eq("id", inv.id);
  if (inv.covered || seatPrice(inv, event) === 0) {
    const paid = await paidByCover({ ...inv, yes_at: yesAt });
    await audit("guest", null, "said_yes", {}, inv.id);
    return paid ? (inv.covered ? { kind: "covered" } : { kind: "paid" }) : { kind: "refresh" };
  }
  // The inviter already sent money for them: hold the seat while the host checks, and show no account.
  const mp = await liveMemberPayment(inv.id);
  if (mp?.status === "claimed") {
    await db()
      .from("invites")
      .update({ status: "awaiting_confirmation", ...pausedClock(inv) })
      .eq("id", inv.id)
      .in("status", ["opened", "said_yes"]);
    await audit("guest", null, "said_yes", { by_member: true }, inv.id);
    return { kind: "refresh" };
  }
  const p: Payment | null = await openGuestPayment(inv);
  if (!p) return { kind: "no_account" };
  if (inv.status === "opened") {
    await db().from("invites").update({ status: "said_yes" }).eq("id", inv.id).eq("status", "opened");
    await audit("guest", null, "said_yes", {}, inv.id);
  }
  return { kind: "payment", payment: await paymentView(p) };
}

/**
 * The guest tapped {inviter} is paying for me (ask) or I'll pay myself instead (stop asking).
 * Only while they still owe a transfer. The hold clock is left alone either way.
 */
export async function askInviter(inv: Invite, ask: boolean): Promise<boolean> {
  if (!canAskInviter(inv)) return false;
  // A host turned this off for the guest, or turned their request down: they pay themselves.
  if (ask && !askAllowed(inv)) return false;
  const event = await getEvent(inv.event_id);
  if (!event.invites_open) return false;
  if (!!inv.pay_requested_at === ask) return true;
  const { data } = await db()
    .from("invites")
    .update({ pay_requested_at: ask ? new Date().toISOString() : null })
    .eq("id", inv.id)
    .eq("event_id", inv.event_id)
    .eq("covered", false)
    .in("status", ASK_STATUSES)
    .select("id")
    .maybeSingle();
  if (!data) return false;
  await audit("guest", null, ask ? "asked_inviter" : "pay_myself", {}, inv.id);
  return true;
}

export async function addNoTaps(inviteId: string, delta: number): Promise<number | null> {
  const { data } = await db().rpc("add_no_taps", { p_invite_id: inviteId, p_delta: Math.trunc(delta) });
  return (data as number | null) ?? null;
}
