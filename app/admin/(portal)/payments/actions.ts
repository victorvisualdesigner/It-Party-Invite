"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { getEventAdmin } from "@/lib/auth";
import { confirmPayment, manualConfirm, matchCandidates, notFoundPayment, type ConfirmResult, type MatchCandidate } from "@/lib/payments";

const id = z.uuid();

export async function confirmAction(paymentId: string): Promise<ActionResult<ConfirmResult>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const pid = id.safeParse(paymentId);
  if (!pid.success) return { ok: false };
  const result = await confirmPayment(admin.eventId, pid.data, admin.id);
  revalidatePath("/admin", "layout");
  return result ? { ok: true, data: result } : { ok: false };
}

export async function notFoundAction(paymentId: string): Promise<ActionResult<{ guest: string }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const pid = id.safeParse(paymentId);
  if (!pid.success) return { ok: false };
  const guest = await notFoundPayment(admin.eventId, pid.data, admin.id);
  revalidatePath("/admin", "layout");
  return guest ? { ok: true, data: { guest } } : { ok: false };
}

export async function matchAction(query: string): Promise<ActionResult<MatchCandidate[]>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  return { ok: true, data: await matchCandidates(admin.eventId, String(query ?? "").slice(0, 60)) };
}

export async function manualConfirmAction(inviteId: string): Promise<ActionResult<ConfirmResult>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const result = await manualConfirm(admin.eventId, iid.data, admin.id);
  revalidatePath("/admin", "layout");
  return result ? { ok: true, data: result } : { ok: false };
}
