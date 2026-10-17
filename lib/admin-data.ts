// Read models for the admin portal: overview numbers, the guest list, the door list and the board.
import "server-only";
import { t } from "@/lib/copy";
import { db } from "@/lib/db";
import { inviteLink, sweep } from "@/lib/invites";
import { cardReadyMessage, revealMessage } from "@/lib/messages";
import { formatNaira } from "@/lib/money";
import { listTeam, type TeamRow } from "@/lib/people";
import { maskPhone } from "@/lib/phone";
import { SLOT_STATUSES, type Invite, type Payment } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

async function names(): Promise<Map<string, string>> {
  const { data } = await db().from("people").select("id, first_name");
  return new Map((data ?? []).map((p) => [p.id as string, p.first_name as string]));
}

async function allInvites(): Promise<Invite[]> {
  await sweep();
  const { data } = await db().from("invites").select("*").neq("status", "draft").order("sent_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as Invite[];
}

/* ---------- Overview ---------- */

export type Activity = { id: string; action: string; line: string; at: string };

const ACTIVITY_KEYS = new Set([
  "sent", "opened", "said_yes", "claimed", "confirmed", "not_found", "expired", "cancelled", "resent",
  "reset_access", "wrong_attempt", "checked_in", "member_added", "member_removed", "event_updated", "account_switched",
]);

export type Overview = {
  paid: number;
  awaiting: number;
  open: number;
  collected: string;
  capacity: number | null;
  capacityUsed: number;
  taps: number;
  funnel: [number, number, number, number];
  team: TeamRow[];
  activity: Activity[];
};

export async function overview(capacity: number | null): Promise<Overview> {
  const [invites, nameOf, team] = await Promise.all([allInvites(), names(), listTeam()]);
  const [{ count: awaiting }, { data: confirmed }, { data: log }] = await Promise.all([
    db().from("payments").select("id", { count: "exact", head: true }).eq("status", "claimed"),
    db().from("payments").select("amount_kobo").eq("status", "confirmed"),
    db().from("audit_log").select("id, action, actor_type, actor_id, invite_id, details, created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  const byId = new Map(invites.map((i) => [i.id, i]));
  const count = (fn: (i: Invite) => boolean) => invites.filter(fn).length;
  const activity: Activity[] = (log ?? [])
    .filter((a) => ACTIVITY_KEYS.has(a.action as string))
    .slice(0, 14)
    .map((a) => {
      const inv = a.invite_id ? byId.get(a.invite_id as string) : undefined;
      const details = (a.details ?? {}) as Record<string, string>;
      const key = a.action === "claimed" && a.actor_type === "member" ? "claimed_member" : (a.action as string);
      const line = t(`admin.activity.${key}` as never, {
        guest: inv?.guest_first_name ?? details.guest ?? "",
        inviter: inv ? nameOf.get(inv.inviter_id) ?? "" : "",
        member: details.member ?? "",
      });
      return { id: a.id as string, action: a.action as string, line, at: a.created_at as string };
    });
  return {
    paid: count((i) => i.status === "paid"),
    awaiting: awaiting ?? 0,
    open: count((i) => ["sent", "opened", "said_yes", "awaiting_confirmation"].includes(i.status)),
    collected: formatNaira((confirmed ?? []).reduce((s, p) => s + (p.amount_kobo as number), 0)),
    capacity,
    capacityUsed: count((i) => SLOT_STATUSES.includes(i.status)),
    taps: invites.reduce((s, i) => s + i.no_taps, 0),
    funnel: [count((i) => !!i.sent_at), count((i) => !!i.opened_at), count((i) => !!i.yes_at), count((i) => i.status === "paid")],
    team,
    activity,
  };
}

/* ---------- Guests ---------- */

export type GuestRow = {
  id: string;
  token: string;
  guest: string;
  masked: string;
  phone: string;
  inviterId: string;
  inviter: string;
  status: Invite["status"];
  covered: boolean;
  taps: number;
  sentAt: string | null;
  ticketCode: string | null;
  payment: { reference: string; status: Payment["status"]; amount: string; byGuest: boolean } | null;
  notifyHref: string | null;
  revealHref: string | null;
};

export async function guestRows(): Promise<GuestRow[]> {
  const [invites, nameOf] = await Promise.all([allInvites(), names()]);
  const { data: payments } = await db()
    .from("payments")
    .select("invite_id, reference, status, amount_kobo, payer_type, created_at")
    .neq("status", "void")
    .order("created_at", { ascending: false });
  const latest = new Map<string, NonNullable<GuestRow["payment"]>>();
  for (const p of payments ?? []) {
    const current = latest.get(p.invite_id as string);
    if (current && current.status === "confirmed") continue;
    if (!current || p.status === "confirmed") {
      latest.set(p.invite_id as string, {
        reference: p.reference as string,
        status: p.status as Payment["status"],
        amount: formatNaira(p.amount_kobo as number),
        byGuest: p.payer_type === "guest",
      });
    }
  }
  return invites.map((i) => {
    const link = inviteLink(i.token);
    const paid = i.status === "paid";
    return {
      id: i.id,
      token: i.token,
      guest: i.guest_first_name,
      masked: maskPhone(i.guest_phone_e164),
      phone: i.guest_phone_e164,
      inviterId: i.inviter_id,
      inviter: nameOf.get(i.inviter_id) ?? "",
      status: i.status,
      covered: i.covered,
      taps: i.no_taps,
      sentAt: i.sent_at,
      ticketCode: i.ticket_code,
      payment: latest.get(i.id) ?? null,
      notifyHref: paid ? waLink(i.guest_phone_e164, cardReadyMessage(i.guest_first_name, link)) : null,
      revealHref: paid ? waLink(i.guest_phone_e164, revealMessage(i.guest_first_name, link)) : null,
    };
  });
}

/* ---------- Door and board ---------- */

export type DoorGuest = { id: string; guest: string; inviter: string; code: string; checkedInAt: string | null };

export async function doorList(): Promise<DoorGuest[]> {
  const [{ data }, nameOf] = await Promise.all([
    db().from("invites").select("id, guest_first_name, inviter_id, ticket_code, checked_in_at").eq("status", "paid").order("guest_first_name"),
    names(),
  ]);
  return (data ?? []).map((i) => ({
    id: i.id as string,
    guest: i.guest_first_name as string,
    inviter: nameOf.get(i.inviter_id as string) ?? "",
    code: i.ticket_code as string,
    checkedInAt: (i.checked_in_at as string | null) ?? null,
  }));
}

export type BoardRow = { id: string; guest: string; taps: number };

export async function boardRows(): Promise<BoardRow[]> {
  const { data } = await db()
    .from("invites")
    .select("id, guest_first_name, no_taps")
    .eq("status", "paid")
    .eq("board_visible", true)
    .order("no_taps", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => ({ id: r.id as string, guest: r.guest_first_name as string, taps: r.no_taps as number }));
}
