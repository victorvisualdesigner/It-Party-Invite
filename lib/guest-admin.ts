// A host's controls for one guest: their own price, the VIP card, and whether they may say their
// inviter is paying. Every write is scoped to the host's event and checks the invite's status first.
import "server-only";
import { isAskingInviter } from "@/lib/ask-inviter";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getInvite } from "@/lib/invites";
import { balanceKobo } from "@/lib/installments";
import { paidByCover, paidSoFar } from "@/lib/payments";
import { priceEditable, seatPrice } from "@/lib/price";
import { getEvent } from "@/lib/settings";
import type { Invite } from "@/lib/types";

const HOUR = 3600e3;

async function inviteIn(eventId: number, inviteId: string): Promise<Invite | null> {
  const inv = await getInvite(inviteId);
  return inv && inv.event_id === eventId ? inv : null;
}

export type PriceResult = { guest: string; paid: boolean };

/**
 * Gives one guest their own price in kobo, or back to the event's with null. Zero lets them in free:
 * if they already said Yes, their card unlocks now. Unpaid transfer details move to the new amount.
 */
export async function setInvitePrice(eventId: number, inviteId: string, kobo: number | null, adminId: string): Promise<PriceResult | null> {
  const inv = await inviteIn(eventId, inviteId);
  if (!inv || !priceEditable(inv) || inv.covered) return null;
  const { data } = await db()
    .from("invites")
    .update({ price_kobo: kobo })
    .eq("id", inv.id)
    .eq("event_id", eventId)
    .in("status", ["sent", "opened", "said_yes"])
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const updated = data as Invite;
  const event = await getEvent(eventId);
  const price = seatPrice(updated, event);
  await audit("admin", adminId, "price_set", { price_kobo: kobo }, inv.id);
  const due = balanceKobo(price, await paidSoFar(inv.id));
  if (due <= 0) {
    // Free, or already paid in full at the new price.
    await db().from("payments").update({ status: "void" }).eq("invite_id", inv.id).in("status", ["open", "not_found"]);
    const paid = updated.yes_at ? await paidByCover(updated) : null;
    return { guest: inv.guest_first_name, paid: !!paid };
  }
  // Transfer details not yet sent follow the new price. Ones being checked are left alone.
  await db().from("payments").update({ amount_kobo: due }).eq("invite_id", inv.id).in("status", ["open", "not_found"]);
  return { guest: inv.guest_first_name, paid: false };
}

/** Turns the VIP card on or off for one guest. They see it the next time they open their link. */
export async function setInviteVip(eventId: number, inviteId: string, vip: boolean, adminId: string): Promise<string | null> {
  const { data } = await db()
    .from("invites")
    .update({ vip })
    .eq("id", inviteId)
    .eq("event_id", eventId)
    .not("status", "in", "(draft,cancelled)")
    .select("guest_first_name")
    .maybeSingle();
  if (!data) return null;
  await audit("admin", adminId, vip ? "vip_on" : "vip_off", {}, inviteId);
  return data.guest_first_name as string;
}

/**
 * The guest stops asking their inviter to pay: the request is cleared and marked as turned down, so
 * the guest sees a note and pays themselves. Their seat is held for at least 6 more hours.
 */
async function turnDown(inv: Invite, adminId: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  const partPaid = (await paidSoFar(inv.id)) > 0;
  const soonest = Date.now() + 6 * HOUR;
  const expires = partPaid ? null : new Date(Math.max(soonest, inv.expires_at ? Date.parse(inv.expires_at) : 0)).toISOString();
  const { data } = await db()
    .from("invites")
    .update({ pay_requested_at: null, pay_request_rejected_at: new Date().toISOString(), expires_at: expires, ...extra })
    .eq("id", inv.id)
    .in("status", ["opened", "said_yes"])
    .not("pay_requested_at", "is", null)
    .select("id")
    .maybeSingle();
  if (!data) return false;
  // Transfer details the inviter opened but never sent stop working.
  await db().from("payments").update({ status: "void" }).eq("invite_id", inv.id).eq("payer_type", "member").in("status", ["open", "not_found"]);
  await audit("admin", adminId, "ask_rejected", {}, inv.id);
  return true;
}

/** The inviter told a host they are not paying: turn the guest's request down. */
export async function rejectPayRequest(eventId: number, inviteId: string, adminId: string): Promise<string | null> {
  const inv = await inviteIn(eventId, inviteId);
  if (!inv || !isAskingInviter(inv)) return null;
  return (await turnDown(inv, adminId)) ? inv.guest_first_name : null;
}

/**
 * Lets one guest say their inviter is paying, or stops them. Stopping a guest who is already asking
 * turns their request down. Allowing again also clears an old turned down request.
 */
export async function setAskAllowed(eventId: number, inviteId: string, allowed: boolean, adminId: string): Promise<string | null> {
  const inv = await inviteIn(eventId, inviteId);
  if (!inv || ["draft", "cancelled"].includes(inv.status)) return null;
  if (!allowed && isAskingInviter(inv)) {
    if (!(await turnDown(inv, adminId, { ask_inviter_off: true }))) return null;
    return inv.guest_first_name;
  }
  const changes = allowed ? { ask_inviter_off: false, pay_request_rejected_at: null } : { ask_inviter_off: true };
  const { data } = await db().from("invites").update(changes).eq("id", inv.id).eq("event_id", eventId).select("id").maybeSingle();
  if (!data) return null;
  await audit("admin", adminId, allowed ? "ask_allowed" : "ask_off", {}, inv.id);
  return inv.guest_first_name;
}
