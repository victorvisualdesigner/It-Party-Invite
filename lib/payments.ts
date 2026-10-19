// Transfers: references, the guest's open payment, claims, and the admin's confirm or Not found.
// The app never says money arrived until an admin confirms it in the bank app.
import "server-only";
import { randomInt } from "node:crypto";
import { ASK_STATUSES, canLetInFree } from "@/lib/ask-inviter";
import { audit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { groupAccountNumber } from "@/lib/event";
import { getInvite, inviteLink, pausedClock, resumedClock } from "@/lib/invites";
import { cardReadyMessage } from "@/lib/messages";
import { formatNaira, nairaDigits } from "@/lib/money";
import { getEvent } from "@/lib/settings";
import { newTicketCode } from "@/lib/tickets";
import type { Invite, Payment, PayoutAccount, Role } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

const LIVE_GUEST: Payment["status"][] = ["open", "claimed", "not_found"];

function newReference(prefix: string): string {
  let digits = "";
  for (let i = 0; i < 4; i++) digits += "23456789"[randomInt(8)];
  return prefix + digits;
}

export type PaymentView = {
  id: string;
  status: Payment["status"];
  reference: string;
  amount: string;
  amount_digits: string;
  bank: string;
  account_number: string;
  account_number_display: string;
  account_name: string;
  sender_name: string | null;
};

export async function paymentView(p: Payment): Promise<PaymentView> {
  const { data } = await db().from("payout_accounts").select("*").eq("id", p.account_id).single();
  const a = data as PayoutAccount;
  return {
    id: p.id,
    status: p.status,
    reference: p.reference,
    amount: formatNaira(p.amount_kobo),
    amount_digits: nairaDigits(p.amount_kobo),
    bank: a.bank_name,
    account_number: a.account_number,
    account_number_display: groupAccountNumber(a.account_number),
    account_name: a.account_name,
    sender_name: p.sender_name,
  };
}

export async function liveGuestPayment(inviteId: string): Promise<Payment | null> {
  const { data } = await db()
    .from("payments")
    .select("*")
    .eq("invite_id", inviteId)
    .eq("payer_type", "guest")
    .in("status", LIVE_GUEST)
    .maybeSingle();
  return (data as Payment | null) ?? null;
}

/**
 * The guest's open payment, made on first Yes. The amount and account are copied now and never
 * change, even if the admin switches accounts. Returns null when no payout account exists yet.
 */
export async function openGuestPayment(inv: Invite): Promise<Payment | null> {
  const existing = await liveGuestPayment(inv.id);
  if (existing) return existing;
  const event = await getEvent(inv.event_id);
  const { data: account } = await db().from("payout_accounts").select("id").eq("event_id", inv.event_id).eq("active", true).maybeSingle();
  if (!account) return null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const { data, error } = await db()
      .from("payments")
      .insert({
        event_id: inv.event_id,
        invite_id: inv.id,
        payer_type: "guest",
        reference: newReference(event.reference_prefix),
        amount_kobo: event.price_kobo,
        account_id: account.id,
        status: "open",
      })
      .select("*")
      .single();
    if (!error && data) return data as Payment;
    if (!isUniqueViolation(error)) throw new Error(`Could not open the payment: ${error?.message}`);
    // Either the reference was taken (draw again) or a second tap already opened one.
    const raced = await liveGuestPayment(inv.id);
    if (raced) return raced;
  }
  throw new Error("Could not find an unused reference.");
}

/* ---------- A member pays for their guest ---------- */

/** The member's payment for this invite that is still in play, newest first. */
export async function liveMemberPayment(inviteId: string): Promise<Payment | null> {
  const { data } = await db()
    .from("payments")
    .select("*")
    .eq("invite_id", inviteId)
    .eq("payer_type", "member")
    .in("status", ["open", "claimed", "not_found", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Payment | null) ?? null;
}

/**
 * Opens (or reuses) the member's payment for one of their guests. Returns null when the guest
 * no longer needs paying for, or when there is no payout account yet.
 */
export async function openMemberPayment(inv: Invite, payerId: string): Promise<Payment | null> {
  if (inv.inviter_id !== payerId || inv.covered || ["paid", "cancelled", "expired", "draft"].includes(inv.status)) return null;
  const existing = await liveMemberPayment(inv.id);
  if (existing && existing.status !== "confirmed") return existing;
  const event = await getEvent(inv.event_id);
  const { data: account } = await db().from("payout_accounts").select("id").eq("event_id", inv.event_id).eq("active", true).maybeSingle();
  if (!account) return null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const { data, error } = await db()
      .from("payments")
      .insert({
        event_id: inv.event_id,
        invite_id: inv.id,
        payer_type: "member",
        payer_person_id: payerId,
        reference: newReference(event.reference_prefix),
        amount_kobo: event.price_kobo,
        account_id: account.id,
        status: "open",
      })
      .select("*")
      .single();
    if (!error && data) return data as Payment;
    if (!isUniqueViolation(error)) throw new Error(`Could not open the payment: ${error?.message}`);
  }
  throw new Error("Could not find an unused reference.");
}

/** The member tapped I've sent it: the payment joins the admin's queue. */
export async function claimMemberPayment(paymentId: string, payerId: string, senderName: string): Promise<Payment | null> {
  const { data } = await db()
    .from("payments")
    .update({ status: "claimed", sender_name: senderName, claimed_at: new Date().toISOString(), resolved_at: null, resolved_by: null })
    .eq("id", paymentId)
    .eq("payer_type", "member")
    .eq("payer_person_id", payerId)
    .in("status", ["open", "not_found", "claimed"])
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const p = data as Payment;
  await audit("member", payerId, "claimed", { reference: p.reference, by_member: true }, p.invite_id);
  // The guest already said Yes (often after asking their inviter to pay): the clock pauses while
  // the host checks, just as when the guest claims. Not found resumes it.
  const inv = await getInvite(p.invite_id);
  if (inv?.status === "said_yes") {
    await db()
      .from("invites")
      .update({ status: "awaiting_confirmation", ...pausedClock(inv) })
      .eq("id", inv.id)
      .eq("event_id", p.event_id)
      .eq("status", "said_yes");
  }
  return p;
}

/** Gives the invite its ticket code, retrying on the rare clash. */
async function markPaid(inv: Pick<Invite, "id" | "event_id">, extra: Record<string, unknown> = {}): Promise<Invite | null> {
  const inviteId = inv.id;
  const event = await getEvent(inv.event_id);
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await db()
      .from("invites")
      .update({ status: "paid", ticket_code: newTicketCode(event.reference_prefix), expires_at: null, hold_remaining_ms: null, ...extra })
      .eq("id", inviteId)
      .neq("status", "paid")
      .not("status", "in", "(cancelled,draft)")
      .select("*")
      .maybeSingle();
    if (!error) return (data as Invite | null) ?? null;
    if (!isUniqueViolation(error)) throw new Error(`Could not mark paid: ${error.message}`);
  }
  return null;
}

/** Guest tapped I've sent it. The clock pauses while the admin checks. */
export async function claimGuestPayment(inv: Invite, senderName: string): Promise<boolean> {
  const p = await liveGuestPayment(inv.id);
  if (!p) return false;
  const { data } = await db()
    .from("payments")
    .update({ status: "claimed", sender_name: senderName, claimed_at: new Date().toISOString(), resolved_at: null, resolved_by: null })
    .eq("id", p.id)
    .in("status", ["open", "not_found", "claimed"])
    .select("id")
    .maybeSingle();
  if (!data) return false;
  await db()
    .from("invites")
    .update({ status: "awaiting_confirmation", ...pausedClock(inv) })
    .eq("id", inv.id)
    .in("status", ["said_yes", "awaiting_confirmation"]);
  await audit("guest", null, "claimed", { reference: p.reference }, inv.id);
  return true;
}

/** Guest tapped Yes on an invite someone already paid for: straight to the card. */
export async function paidByCover(inv: Invite): Promise<Invite | null> {
  const paid = await markPaid(inv, { yes_at: inv.yes_at ?? new Date().toISOString() });
  if (paid) await audit("system", null, "paid", { covered: true }, inv.id);
  return paid;
}

/* ---------- Admin ---------- */

export type Claim = {
  payment: Payment;
  invite: Invite;
  inviterName: string;
  payerName: string;
  amount: string;
  duplicate: boolean;
};

export async function listClaims(eventId: number): Promise<Claim[]> {
  const { data } = await db().from("payments").select("*").eq("event_id", eventId).eq("status", "claimed").order("claimed_at", { ascending: true });
  const payments = (data ?? []) as Payment[];
  if (!payments.length) return [];
  const inviteIds = [...new Set(payments.map((p) => p.invite_id))];
  const [{ data: invites }, { data: siblings }] = await Promise.all([
    db().from("invites").select("*").in("id", inviteIds),
    db().from("payments").select("invite_id, status").in("invite_id", inviteIds).in("status", ["claimed", "confirmed"]),
  ]);
  const inviterIds = [...new Set((invites ?? []).map((i) => i.inviter_id as string))];
  const { data: people } = await db().from("people").select("id, first_name").in("id", inviterIds);
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.first_name as string]));
  const byId = new Map((invites ?? []).map((i) => [i.id as string, i as Invite]));
  const count = new Map<string, number>();
  for (const s of siblings ?? []) count.set(s.invite_id, (count.get(s.invite_id) ?? 0) + 1);
  return payments
    .filter((p) => byId.has(p.invite_id))
    .map((p) => {
      const invite = byId.get(p.invite_id) as Invite;
      return {
        payment: p,
        invite,
        inviterName: nameOf.get(invite.inviter_id) ?? "",
        payerName: invite.guest_first_name,
        amount: formatNaira(p.amount_kobo),
        duplicate: (count.get(p.invite_id) ?? 0) > 1,
      };
    });
}

export type ConfirmResult = { guest: string; cardReady: boolean; notifyHref: string | null };

function notify(inv: Invite): string {
  return waLink(inv.guest_phone_e164, cardReadyMessage(inv.guest_first_name, inviteLink(inv.token)));
}

/**
 * The admin saw the money in the bank app. A guest payment unlocks the card. If the guest has not
 * tapped Yes yet (a transfer matched by hand), the invite is covered and turns paid on their Yes.
 */
export async function confirmPayment(eventId: number, paymentId: string, adminId: string): Promise<ConfirmResult | null> {
  const { data } = await db()
    .from("payments")
    .update({ status: "confirmed", resolved_at: new Date().toISOString(), resolved_by: adminId })
    .eq("id", paymentId)
    .eq("event_id", eventId)
    .eq("status", "claimed")
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const p = data as Payment;
  const inv = await getInvite(p.invite_id);
  if (!inv) return null;
  await audit("admin", adminId, "confirmed", { reference: p.reference }, inv.id);
  if (inv.yes_at) {
    const paid = await markPaid(inv);
    if (paid) await audit("system", null, "paid", {}, inv.id);
    // Whoever did not pay no longer needs to: their unpaid transfer details stop working.
    await db().from("payments").update({ status: "void" }).eq("invite_id", inv.id).neq("id", p.id).in("status", ["open", "not_found"]);
    return { guest: inv.guest_first_name, cardReady: true, notifyHref: notify(inv) };
  }
  await db().from("invites").update({ covered: true, expires_at: null, hold_remaining_ms: null }).eq("id", inv.id);
  return { guest: inv.guest_first_name, cardReady: false, notifyHref: null };
}

/** Not found: the guest goes back to the transfer screen and the clock resumes with at least 6 hours. */
export async function notFoundPayment(eventId: number, paymentId: string, adminId: string): Promise<string | null> {
  const { data } = await db()
    .from("payments")
    .update({ status: "not_found", resolved_at: new Date().toISOString(), resolved_by: adminId })
    .eq("id", paymentId)
    .eq("event_id", eventId)
    .eq("status", "claimed")
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const p = data as Payment;
  const inv = await getInvite(p.invite_id);
  if (!inv) return null;
  if (inv.status === "awaiting_confirmation") {
    await db().from("invites").update({ status: "said_yes", ...resumedClock(inv) }).eq("id", inv.id).eq("status", "awaiting_confirmation");
  }
  await audit("admin", adminId, "not_found", { reference: p.reference }, inv.id);
  return inv.guest_first_name;
}

/**
 * A host's guest asked their inviter to pay. Any admin of the event can let them in free instead:
 * the invite is covered, and it turns paid now because the guest has already said Yes.
 */
export async function letInFree(eventId: number, inviteId: string, adminId: string): Promise<{ guest: string; paid: boolean } | null> {
  const inv = await getInvite(inviteId);
  if (!inv || inv.event_id !== eventId) return null;
  const { data: inviter } = await db().from("people").select("role").eq("id", inv.inviter_id).maybeSingle();
  if (!canLetInFree(inv, (inviter?.role as Role | undefined) ?? null)) return null;
  const { data } = await db()
    .from("invites")
    .update({ covered: true, expires_at: null, hold_remaining_ms: null })
    .eq("id", inv.id)
    .eq("event_id", eventId)
    .eq("covered", false)
    .in("status", ASK_STATUSES)
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const covered = data as Invite;
  // Nobody needs to transfer now: any unpaid transfer details for this guest stop working.
  await db().from("payments").update({ status: "void" }).eq("invite_id", inv.id).eq("event_id", eventId).in("status", ["open", "not_found"]);
  await audit("admin", adminId, "let_in_free", {}, inv.id);
  const paid = covered.yes_at ? await paidByCover(covered) : null;
  return { guest: inv.guest_first_name, paid: !!paid };
}

export type MatchCandidate = { id: string; guest: string; inviter: string; status: Invite["status"]; reference: string | null };

/** Invites that could own a transfer with no reference: search by guest name or the ticket amount. */
export async function matchCandidates(eventId: number, query: string): Promise<MatchCandidate[]> {
  const q = query.trim().toLowerCase();
  const event = await getEvent(eventId);
  const { data } = await db()
    .from("invites")
    .select("id, guest_first_name, inviter_id, status")
    .eq("event_id", eventId)
    .in("status", ["sent", "opened", "said_yes", "awaiting_confirmation"])
    .order("guest_first_name");
  const digits = q.replace(/\D/g, "");
  const amountMatch = !!digits && nairaDigits(event.price_kobo).startsWith(digits);
  const rows = (data ?? []).filter((i) => !q || amountMatch || String(i.guest_first_name).toLowerCase().includes(q));
  const ids = rows.map((r) => r.id as string);
  const [{ data: people }, { data: payments }] = await Promise.all([
    db().from("people").select("id, first_name").or(`event_id.eq.${eventId},event_id.is.null`),
    ids.length ? db().from("payments").select("invite_id, reference").in("invite_id", ids).in("status", LIVE_GUEST) : Promise.resolve({ data: [] as { invite_id: string; reference: string }[] }),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.first_name as string]));
  const refOf = new Map((payments ?? []).map((p) => [p.invite_id as string, p.reference as string]));
  return rows.slice(0, 40).map((r) => ({
    id: r.id as string,
    guest: r.guest_first_name as string,
    inviter: nameOf.get(r.inviter_id as string) ?? "",
    status: r.status as Invite["status"],
    reference: refOf.get(r.id as string) ?? null,
  }));
}

/** Confirms a transfer the admin matched by hand. */
export async function manualConfirm(eventId: number, inviteId: string, adminId: string): Promise<ConfirmResult | null> {
  const inv = await getInvite(inviteId);
  if (!inv || inv.event_id !== eventId || !["sent", "opened", "said_yes", "awaiting_confirmation"].includes(inv.status)) return null;
  let p = await liveGuestPayment(inv.id);
  if (!p) p = await openGuestPayment(inv);
  if (!p) return null;
  await db()
    .from("payments")
    .update({ status: "claimed", claimed_at: p.claimed_at ?? new Date().toISOString() })
    .eq("id", p.id)
    .in("status", LIVE_GUEST);
  return confirmPayment(eventId, p.id, adminId);
}
