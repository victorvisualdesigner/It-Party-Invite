// What the guest page may know, screen by screen. Before a correct number and key, only the masked
// number (or a screen with no details) leaves the server.
import "server-only";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatEventDate, isRevealed, revealHint } from "@/lib/event";
import { refreshExpiry } from "@/lib/invites";
import { verifyKey } from "@/lib/keys";
import { formatNaira } from "@/lib/money";
import { liveGuestPayment, openGuestPayment, paidByCover, paymentView, type PaymentView } from "@/lib/payments";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { getEvent } from "@/lib/settings";
import { addInviteDevice } from "@/lib/session";
import { ticketQrSvg } from "@/lib/tickets";
import type { EventRow, Invite, Payment } from "@/lib/types";

const MINUTE = 60e3;
const HOUR = 3600e3;
export const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * MINUTE;

export type EventView = {
  name: string;
  date: string | null;
  starts_at: string | null;
  venue: string | null;
  venue_address: string | null;
  venue_hint: string;
  dress: string;
  price: string;
  refund: string;
};

export type GuestView =
  | { screen: "stranger" }
  | { screen: "claimed" }
  | { screen: "lock"; masked: string }
  | { screen: "rest"; minutes: number }
  | { screen: "cancelled" }
  | { screen: "expired"; inviter: string | null }
  | ({
      screen: "card" | "wait" | "notfound" | "covered" | "ticket" | "closed";
      guest: string;
      inviter: string;
      event: EventView;
      status: Invite["status"];
      covered: boolean;
      taps: number;
      board: boolean;
      hold_ends: string | null;
      payment: PaymentView | null;
      by_member: boolean;
      ticket_code: string | null;
      qr: string | null;
    });

export function eventView(e: EventRow, paid: boolean): EventView {
  const dateShown = isRevealed(e.reveal_date_mode, e.reveal_date_at, paid) && !!e.starts_at;
  const venueShown = isRevealed(e.reveal_venue_mode, e.reveal_venue_at, paid);
  return {
    name: e.name,
    date: dateShown ? formatEventDate(e.starts_at as string) : null,
    starts_at: dateShown ? e.starts_at : null,
    venue: venueShown ? e.venue_name : null,
    venue_address: venueShown ? e.venue_address : null,
    venue_hint: revealHint(e.reveal_venue_mode, e.reveal_venue_at, e.starts_at),
    dress: e.dress_code,
    price: formatNaira(e.price_kobo),
    refund: e.refund_text,
  };
}

async function inviterName(inv: Invite): Promise<string> {
  const { data } = await db().from("people").select("first_name").eq("id", inv.inviter_id).single();
  return (data?.first_name as string) ?? "";
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

  const event = await getEvent();
  const paid = inv.status === "paid";
  const base = {
    guest: inv.guest_first_name,
    inviter: await inviterName(inv),
    event: eventView(event, paid),
    status: inv.status,
    covered: inv.covered,
    taps: inv.no_taps,
    board: inv.board_visible,
    hold_ends: inv.expires_at,
    payment: null as PaymentView | null,
    by_member: false,
    ticket_code: paid ? inv.ticket_code : null,
    qr: paid && inv.ticket_code ? await ticketQrSvg(inv.ticket_code) : null,
  };
  if (paid) return { screen: "ticket", ...base };
  if (!event.invites_open) return { screen: "closed", ...base };

  const p = await liveGuestPayment(inv.id);
  if (p) base.payment = await paymentView(p);
  if (inv.status === "awaiting_confirmation") return { screen: "wait", ...base };
  if (inv.status === "said_yes" && p?.status === "not_found") return { screen: "notfound", ...base };
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
      const event = await getEvent();
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
  const event = await getEvent();
  if (!event.invites_open) return { kind: "refresh" };
  const yesAt = inv.yes_at ?? new Date().toISOString();
  if (!inv.yes_at) await db().from("invites").update({ yes_at: yesAt }).eq("id", inv.id);
  if (inv.covered || event.price_kobo === 0) {
    const paid = await paidByCover({ ...inv, yes_at: yesAt });
    await audit("guest", null, "said_yes", {}, inv.id);
    return paid ? (inv.covered ? { kind: "covered" } : { kind: "paid" }) : { kind: "refresh" };
  }
  const p: Payment | null = await openGuestPayment(inv);
  if (!p) return { kind: "no_account" };
  if (inv.status === "opened") {
    await db().from("invites").update({ status: "said_yes" }).eq("id", inv.id).eq("status", "opened");
    await audit("guest", null, "said_yes", {}, inv.id);
  }
  return { kind: "payment", payment: await paymentView(p) };
}

export async function addNoTaps(inviteId: string, delta: number): Promise<number | null> {
  const { data } = await db().rpc("add_no_taps", { p_invite_id: inviteId, p_delta: Math.trunc(delta) });
  return (data as number | null) ?? null;
}

export async function setBoardVisible(inviteId: string, on: boolean): Promise<void> {
  await db().from("invites").update({ board_visible: on }).eq("id", inviteId);
}
