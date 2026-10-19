// Members and the host: add, slots, keys, removal.
import "server-only";
import { audit } from "@/lib/audit";
import { t } from "@/lib/copy";
import { db, isUniqueViolation } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { generateKey, hashKey } from "@/lib/keys";
import type { MemberValues } from "@/lib/schemas";
import { getEvent } from "@/lib/settings";
import { isHost, SLOT_STATUSES, type InviteStatus, type Person } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

export type TeamRow = Pick<Person, "id" | "role" | "first_name" | "phone_e164" | "slot_limit" | "created_at"> & {
  used: number;
  paid: number;
};

/** A freshly made key, ready to send. The plain key exists only here and in the WhatsApp text. */
export type KeyDelivery = { personId: string; firstName: string; key: string; message: string; waHref: string };

const UNPAID_CANCELLABLE: InviteStatus[] = ["draft", "sent", "opened", "said_yes", "awaiting_confirmation"];

/** This event's members and hosts. The superadmin shows up only when they invited someone here. */
export async function listTeam(eventId: number): Promise<TeamRow[]> {
  const [{ data: people, error }, { data: invites, error: invitesError }] = await Promise.all([
    db()
      .from("people")
      .select("id, role, first_name, phone_e164, slot_limit, created_at")
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    db().from("invites").select("inviter_id, status").eq("event_id", eventId).in("status", SLOT_STATUSES),
  ]);
  if (error || invitesError) throw new Error(`Could not load the team: ${(error ?? invitesError)?.message}`);
  const used = new Map<string, number>();
  const paid = new Map<string, number>();
  for (const inv of invites ?? []) {
    used.set(inv.inviter_id, (used.get(inv.inviter_id) ?? 0) + 1);
    if (inv.status === "paid") paid.set(inv.inviter_id, (paid.get(inv.inviter_id) ?? 0) + 1);
  }
  return ((people ?? []) as TeamRow[])
    .filter((p) => p.role !== "superadmin" || used.has(p.id))
    .map((p) => ({ ...p, used: used.get(p.id) ?? 0, paid: paid.get(p.id) ?? 0 }))
    .sort((a, b) => Number(!isHost(a.role)) - Number(!isHost(b.role)));
}

async function keyDelivery(eventId: number, person: Pick<Person, "id" | "first_name" | "phone_e164">, key: string): Promise<KeyDelivery> {
  const event = await getEvent(eventId);
  const message = t("admin.members.key_message", {
    member: person.first_name,
    event: event.name,
    link: appUrl("/m"),
    key,
  });
  return { personId: person.id, firstName: person.first_name, key, message, waHref: waLink(person.phone_e164, message) };
}

export type AddMemberResult = { ok: true; delivery: KeyDelivery } | { ok: false; errors: Record<string, string> };

export async function addMember(eventId: number, values: MemberValues, adminId: string): Promise<AddMemberResult> {
  const duplicate = { ok: false as const, errors: { phone: t("admin.members.duplicate_error") } };
  const { data: existing } = await db()
    .from("people")
    .select("id, role, active")
    .eq("event_id", eventId)
    .eq("phone_e164", values.phone_e164)
    .maybeSingle();
  if (existing && (existing.active || isHost(existing.role))) return duplicate;

  const key = generateKey();
  const keyHash = await hashKey(key);
  const row = { first_name: values.first_name, slot_limit: values.slot_limit, key_hash: keyHash, active: true };

  // A removed member's number comes back as the same row, because phone numbers are unique.
  const result = existing
    ? await db().from("people").update(row).eq("id", existing.id).eq("active", false).select("id, first_name, phone_e164").single()
    : await db()
        .from("people")
        .insert({ ...row, role: "member", event_id: eventId, phone_e164: values.phone_e164 })
        .select("id, first_name, phone_e164")
        .single();
  if (isUniqueViolation(result.error) || (existing && !result.data)) return duplicate;
  if (result.error || !result.data) throw new Error(`Could not add the member: ${result.error?.message}`);

  await audit("admin", adminId, "member_added", { member: values.first_name, person_id: result.data.id }, null, eventId);
  return { ok: true, delivery: await keyDelivery(eventId, result.data, key) };
}

export async function setSlots(eventId: number, personId: string, slotLimit: number | null, adminId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("people")
    .update({ slot_limit: slotLimit })
    .eq("id", personId)
    .eq("event_id", eventId)
    .eq("role", "member")
    .eq("active", true)
    .select("first_name")
    .maybeSingle();
  if (error) throw new Error(`Could not update slots: ${error.message}`);
  if (!data) return false;
  await audit("admin", adminId, "member_slots_changed", { member: data.first_name, person_id: personId, slot_limit: slotLimit }, null, eventId);
  return true;
}

/** New key for a member or the host. The old key stops working and every signed in phone is signed out. */
export async function resetMemberKey(eventId: number, personId: string, adminId: string): Promise<KeyDelivery | null> {
  const key = generateKey();
  const { data, error } = await db()
    .from("people")
    .update({ key_hash: await hashKey(key) })
    .eq("id", personId)
    .eq("event_id", eventId)
    .eq("active", true)
    .select("id, first_name, phone_e164")
    .maybeSingle();
  if (error) throw new Error(`Could not make a new key: ${error.message}`);
  if (!data) return null;
  await db().from("member_devices").delete().eq("person_id", personId);
  await audit("admin", adminId, "member_key_reset", { member: data.first_name, person_id: personId }, null, eventId);
  return keyDelivery(eventId, data, key);
}

/** Removes a member: inactive, never deleted. Unpaid invites are cancelled, paid guests stay. */
export async function removeMember(eventId: number, personId: string, adminId: string): Promise<string | null> {
  const { data: person, error } = await db()
    .from("people")
    .update({ active: false })
    .eq("id", personId)
    .eq("event_id", eventId)
    .eq("role", "member")
    .eq("active", true)
    .select("first_name")
    .maybeSingle();
  if (error) throw new Error(`Could not remove the member: ${error.message}`);
  if (!person) return null;

  const { data: cancelled, error: cancelError } = await db()
    .from("invites")
    .update({ status: "cancelled", key_plain_draft: null, expires_at: null, hold_remaining_ms: null })
    .eq("inviter_id", personId)
    .in("status", UNPAID_CANCELLABLE)
    .select("id");
  if (cancelError) throw new Error(`Could not cancel their invites: ${cancelError.message}`);
  const ids = (cancelled ?? []).map((i) => i.id as string);
  if (ids.length) {
    await db().from("payments").update({ status: "void" }).in("invite_id", ids).in("status", ["open", "claimed", "not_found"]);
  }
  await db().from("member_devices").delete().eq("person_id", personId);

  await audit("admin", adminId, "member_removed", { member: person.first_name, person_id: personId, cancelled: ids.length }, null, eventId);
  for (const id of ids) await audit("admin", adminId, "cancelled", { reason: "member_removed" }, id);
  return person.first_name;
}
