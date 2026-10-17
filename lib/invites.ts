// The invite state machine: drafts, sending, slots, capacity, expiry, cancel and reset.
// Every transition is a conditional update on the current status, so two taps never race.
import "server-only";
import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { t } from "@/lib/copy";
import { db, isUniqueViolation } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { generateKey, hashKey } from "@/lib/keys";
import { assembleMessage, randomCombo, randomKeyLine } from "@/lib/messages";
import { localPhone, maskPhone } from "@/lib/phone";
import { getEvent } from "@/lib/settings";
import { EXPIRABLE_STATUSES, SLOT_STATUSES, type ActorType, type EventRow, type Invite, type Person } from "@/lib/types";
import { smsLink, waLink } from "@/lib/whatsapp";

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export type Inviter = Pick<Person, "id" | "role" | "first_name" | "slot_limit">;

export function inviteLink(token: string): string {
  return appUrl(`/i/${token}`);
}

/** 16 random bytes, URL safe: 22 characters. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

/* ---------- Reads with lazy expiry ---------- */

async function voidLivePayments(inviteIds: string[]): Promise<void> {
  if (!inviteIds.length) return;
  await db().from("payments").update({ status: "void" }).in("invite_id", inviteIds).in("status", ["open", "not_found"]);
}

/** Expires the invite if its deadline has passed. Correctness never waits for the cron sweep. */
export async function refreshExpiry(inv: Invite): Promise<Invite> {
  if (!EXPIRABLE_STATUSES.includes(inv.status) || inv.covered || !inv.expires_at) return inv;
  if (Date.parse(inv.expires_at) > Date.now()) return inv;
  const { data } = await db()
    .from("invites")
    .update({ status: "expired" })
    .eq("id", inv.id)
    .in("status", EXPIRABLE_STATUSES)
    .eq("covered", false)
    .lt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (data) {
    await voidLivePayments([inv.id]);
    await audit("system", null, "expired", {}, inv.id);
    return data as Invite;
  }
  return (await getInvite(inv.id)) ?? inv;
}

export async function getInvite(id: string): Promise<Invite | null> {
  const { data } = await db().from("invites").select("*").eq("id", id).maybeSingle();
  return (data as Invite | null) ?? null;
}

export async function getInviteByToken(token: string): Promise<Invite | null> {
  if (!/^[\w-]{22,64}$/.test(token)) return null;
  const { data } = await db().from("invites").select("*").eq("token", token).maybeSingle();
  return data ? refreshExpiry(data as Invite) : null;
}

/** Expires every overdue invite and deletes drafts older than a day. Used by the cron route and the admin. */
export async function sweep(): Promise<{ expired: number; drafts: number }> {
  const now = new Date();
  const { data: expired } = await db()
    .from("invites")
    .update({ status: "expired" })
    .in("status", EXPIRABLE_STATUSES)
    .eq("covered", false)
    .lt("expires_at", now.toISOString())
    .select("id");
  const ids = (expired ?? []).map((r) => r.id as string);
  await voidLivePayments(ids);
  for (const id of ids) await audit("system", null, "expired", {}, id);
  const { data: drafts } = await db()
    .from("invites")
    .delete()
    .eq("status", "draft")
    .lt("created_at", new Date(now.getTime() - DAY).toISOString())
    .select("id");
  return { expired: ids.length, drafts: (drafts ?? []).length };
}

/* ---------- Slots and capacity ---------- */

export type SlotInfo = { used: number; total: number | null; left: number; unlimited: boolean };

export async function slotInfo(inviter: Inviter): Promise<SlotInfo> {
  const { count } = await db()
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", inviter.id)
    .in("status", SLOT_STATUSES);
  const used = count ?? 0;
  const unlimited = inviter.role === "admin" || inviter.slot_limit == null;
  const total = unlimited ? null : (inviter.slot_limit as number);
  return { used, total, left: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, (total as number) - used), unlimited };
}

export type CapacityInfo = { used: number; capacity: number | null; left: number; nearlyFull: boolean };

export async function capacityInfo(event: EventRow): Promise<CapacityInfo> {
  const { count } = await db().from("invites").select("id", { count: "exact", head: true }).in("status", SLOT_STATUSES);
  const used = count ?? 0;
  const left = event.capacity == null ? Number.POSITIVE_INFINITY : Math.max(0, event.capacity - used);
  return { used, capacity: event.capacity, left, nearlyFull: event.capacity != null && left <= 3 };
}

/** Why this inviter cannot send right now, as a copy string, or null when they can send `n` more. */
export async function sendBlocker(inviter: Inviter, n = 1): Promise<string | null> {
  const event = await getEvent();
  if (!event.invites_open) return t("guest.closed.body", { event: event.name });
  const slots = await slotInfo(inviter);
  if (slots.left <= 0) return t("member.home.slots_none");
  if (slots.left < n) return t("member.new_invite.slots_short", { left: slots.left });
  const cap = await capacityInfo(event);
  if (cap.left <= 0 || cap.left < n) return t("member.new_invite.capacity_full");
  return null;
}

/* ---------- Drafts ---------- */

export type DraftRow = { first_name: string; phone_e164: string };

export type DraftView = {
  id: string;
  guest: string;
  phone: string;
  masked: string;
  key: string;
  message: string;
  waHref: string;
  smsHref: string;
};

function draftMessage(inv: Pick<Invite, "token" | "guest_first_name" | "message_combo" | "key_line_index">, inviterName: string, key: string): string {
  return assembleMessage({
    guest: inv.guest_first_name,
    inviter: inviterName,
    link: inviteLink(inv.token),
    key,
    combo: inv.message_combo,
    keyLine: inv.key_line_index,
  });
}

function toDraftView(inv: Invite, inviterName: string): DraftView {
  const key = inv.key_plain_draft ?? "";
  const message = draftMessage(inv, inviterName, key);
  return {
    id: inv.id,
    guest: inv.guest_first_name,
    phone: localPhone(inv.guest_phone_e164),
    masked: maskPhone(inv.guest_phone_e164),
    key,
    message,
    waHref: waLink(inv.guest_phone_e164, message),
    smsHref: smsLink(inv.guest_phone_e164, message),
  };
}

async function insertDraft(inviter: Inviter, row: DraftRow): Promise<Invite> {
  const key = generateKey();
  const keyHash = await hashKey(key);
  for (let attempt = 0; attempt < 50; attempt++) {
    const { data, error } = await db()
      .from("invites")
      .insert({
        token: newToken(),
        inviter_id: inviter.id,
        guest_first_name: row.first_name,
        guest_phone_e164: row.phone_e164,
        key_hash: keyHash,
        key_plain_draft: key,
        message_combo: randomCombo(),
        key_line_index: randomKeyLine(),
        status: "draft",
      })
      .select("*")
      .single();
    if (!error && data) return data as Invite;
    // A taken message combination or token: draw again.
    if (!isUniqueViolation(error)) throw new Error(`Could not create the invite: ${error?.message}`);
  }
  throw new Error("Could not find an unused message combination.");
}

export type CreateDraftsResult =
  | { ok: true; drafts: DraftView[] }
  | { ok: false; errors: Record<string, string> };

/** Validates every guest, then creates one draft each. Drafts hold no slot until they are sent. */
export async function createDrafts(inviter: Inviter, rows: DraftRow[]): Promise<CreateDraftsResult> {
  await sweep();
  const blocker = await sendBlocker(inviter, rows.length);
  if (blocker) return { ok: false, errors: { form: blocker } };

  const errors: Record<string, string> = {};
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    if (seen.has(row.phone_e164)) errors[`rows.${i}.phone`] = t("member.new_invite.duplicate_error");
    seen.set(row.phone_e164, i);
  });
  const { data: live } = await db()
    .from("invites")
    .select("guest_phone_e164")
    .in("guest_phone_e164", rows.map((r) => r.phone_e164))
    .not("status", "in", "(draft,expired,cancelled)");
  const taken = new Set((live ?? []).map((r) => r.guest_phone_e164 as string));
  rows.forEach((row, i) => {
    if (taken.has(row.phone_e164)) errors[`rows.${i}.phone`] = t("member.new_invite.duplicate_error");
  });
  if (Object.keys(errors).length) return { ok: false, errors };

  // An older unsent draft for the same number from this inviter is replaced.
  await db()
    .from("invites")
    .delete()
    .eq("inviter_id", inviter.id)
    .eq("status", "draft")
    .in("guest_phone_e164", rows.map((r) => r.phone_e164));

  const drafts: DraftView[] = [];
  for (const row of rows) drafts.push(toDraftView(await insertDraft(inviter, row), inviter.first_name));
  return { ok: true, drafts };
}

async function ownedDraft(inviteId: string, inviter: Inviter): Promise<Invite | null> {
  const { data } = await db()
    .from("invites")
    .select("*")
    .eq("id", inviteId)
    .eq("inviter_id", inviter.id)
    .eq("status", "draft")
    .maybeSingle();
  return (data as Invite | null) ?? null;
}

/** Shuffle: a new unused combination and key line, same key. */
export async function shuffleDraft(inviteId: string, inviter: Inviter): Promise<DraftView | null> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { data, error } = await db()
      .from("invites")
      .update({ message_combo: randomCombo(), key_line_index: randomKeyLine() })
      .eq("id", inviteId)
      .eq("inviter_id", inviter.id)
      .eq("status", "draft")
      .select("*")
      .maybeSingle();
    if (!error) return data ? toDraftView(data as Invite, inviter.first_name) : null;
    if (!isUniqueViolation(error)) throw new Error(`Could not shuffle: ${error.message}`);
  }
  return null;
}

export type SendResult = { ok: true } | { ok: false; message: string };

/** The inviter tapped Send: the invite goes out, its clock starts and the plain key leaves the database. */
export async function sendDraft(inviteId: string, inviter: Inviter, actor: ActorType): Promise<SendResult> {
  const draft = await ownedDraft(inviteId, inviter);
  if (!draft) {
    const inv = await getInvite(inviteId);
    // A second tap on Send for an invite that already went out is fine.
    if (inv && inv.inviter_id === inviter.id && inv.status !== "draft") return { ok: true };
    return { ok: false, message: t("admin.common.error_network") };
  }
  const blocker = await sendBlocker(inviter, 1);
  if (blocker) return { ok: false, message: blocker };
  const event = await getEvent();
  const now = new Date();
  const { data, error } = await db()
    .from("invites")
    .update({
      status: "sent",
      sent_at: now.toISOString(),
      expires_at: new Date(now.getTime() + event.unopened_expiry_days * DAY).toISOString(),
      key_plain_draft: null,
    })
    .eq("id", inviteId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (isUniqueViolation(error)) return { ok: false, message: t("member.new_invite.duplicate_error") };
  if (error) throw new Error(`Could not send: ${error.message}`);
  if (data) await audit(actor, inviter.id, "sent", { guest: draft.guest_first_name }, inviteId);
  return { ok: true };
}

/* ---------- Admin actions on an invite ---------- */

/** Cancels any invite that is not paid. Live payments are voided. */
export async function cancelInvite(inviteId: string, actorId: string): Promise<boolean> {
  const { data } = await db()
    .from("invites")
    .update({ status: "cancelled", expires_at: null, hold_remaining_ms: null, key_plain_draft: null })
    .eq("id", inviteId)
    .not("status", "in", "(paid,cancelled)")
    .select("id, guest_first_name")
    .maybeSingle();
  if (!data) return false;
  await db().from("payments").update({ status: "void" }).eq("invite_id", inviteId).in("status", ["open", "claimed", "not_found"]);
  await audit("admin", actorId, "cancelled", { guest: data.guest_first_name }, inviteId);
  return true;
}

export type KeyedMessage = { guest: string; key: string; message: string; waHref: string };

/**
 * Reset access: a new key, the old one stops working, every phone is signed out, the lockout clears.
 * Returns the full invite message with the new key, ready to send again.
 */
export async function resetAccess(inviteId: string, actorId: string): Promise<KeyedMessage | null> {
  const key = generateKey();
  const { data } = await db()
    .from("invites")
    .update({ key_hash: await hashKey(key), wrong_attempts: 0, locked_until: null })
    .eq("id", inviteId)
    .in("status", ["sent", "opened", "said_yes", "awaiting_confirmation", "paid"])
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const inv = data as Invite;
  await db().from("invite_devices").delete().eq("invite_id", inviteId);
  const { data: inviter } = await db().from("people").select("first_name").eq("id", inv.inviter_id).single();
  const message = draftMessage(inv, inviter?.first_name ?? "", key);
  await audit("admin", actorId, "reset_access", { guest: inv.guest_first_name }, inviteId);
  return { guest: inv.guest_first_name, key, message, waHref: waLink(inv.guest_phone_e164, message) };
}

/** Pauses the hold clock while a payment waits for the admin. */
export function pausedClock(inv: Invite): { hold_remaining_ms: number | null; expires_at: null } {
  const remaining = inv.expires_at ? Math.max(0, Date.parse(inv.expires_at) - Date.now()) : inv.hold_remaining_ms;
  return { hold_remaining_ms: remaining, expires_at: null };
}

/** Resumes the clock after Not found: at least 6 hours. */
export function resumedClock(inv: Invite): { expires_at: string; hold_remaining_ms: null } {
  const ms = Math.max(inv.hold_remaining_ms ?? 0, 6 * HOUR);
  return { expires_at: new Date(Date.now() + ms).toISOString(), hold_remaining_ms: null };
}
