"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { getEventAdmin } from "@/lib/auth";
import { rejectPayRequest, setAskAllowed, setInvitePrice, setInviteVip, type PriceResult } from "@/lib/guest-admin";
import { cancelInvite, resetAccess, type KeyedMessage } from "@/lib/invites";
import { nairaToKobo } from "@/lib/money";
import { t } from "@/lib/copy";
import { letInFree } from "@/lib/payments";

const id = z.uuid();

export async function resetAccessAction(inviteId: string): Promise<ActionResult<KeyedMessage>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const result = await resetAccess(admin.eventId, iid.data, admin.id);
  revalidatePath("/admin/guests");
  return result ? { ok: true, data: result } : { ok: false };
}

export async function cancelInviteAction(inviteId: string): Promise<ActionResult> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const done = await cancelInvite(admin.eventId, iid.data, admin.id);
  revalidatePath("/admin", "layout");
  return done ? { ok: true } : { ok: false };
}

/** A host's guest asked their inviter to pay: let them in free instead. */
export async function letInFreeAction(inviteId: string): Promise<ActionResult<{ guest: string; paid: boolean }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const result = await letInFree(admin.eventId, iid.data, admin.id);
  revalidatePath("/admin", "layout");
  return result ? { ok: true, data: result } : { ok: false };
}

/** Their own price in naira, or "" for the event's price. Zero lets them in free. */
export async function setPriceAction(inviteId: string, naira: string): Promise<ActionResult<PriceResult>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const raw = String(naira ?? "").trim();
  const kobo = raw === "" ? null : nairaToKobo(raw);
  if (raw !== "" && kobo == null) return { ok: false, errors: { price: t("admin.guests.manage.price_error") } };
  const result = await setInvitePrice(admin.eventId, iid.data, kobo, admin.id);
  revalidatePath("/admin", "layout");
  return result ? { ok: true, data: result } : { ok: false };
}

export async function setVipAction(inviteId: string, vip: boolean): Promise<ActionResult<{ guest: string }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const guest = await setInviteVip(admin.eventId, iid.data, !!vip, admin.id);
  revalidatePath("/admin/guests");
  return guest ? { ok: true, data: { guest } } : { ok: false };
}

export async function setAskAllowedAction(inviteId: string, allowed: boolean): Promise<ActionResult<{ guest: string }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const guest = await setAskAllowed(admin.eventId, iid.data, !!allowed, admin.id);
  revalidatePath("/admin", "layout");
  return guest ? { ok: true, data: { guest } } : { ok: false };
}

/** The inviter said they are not paying: turn the guest's request down. */
export async function rejectAskAction(inviteId: string): Promise<ActionResult<{ guest: string }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const guest = await rejectPayRequest(admin.eventId, iid.data, admin.id);
  revalidatePath("/admin", "layout");
  return guest ? { ok: true, data: { guest } } : { ok: false };
}
