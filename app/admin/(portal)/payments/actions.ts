"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { getAdmin } from "@/lib/auth";
import { confirmPayment, manualConfirm, matchCandidates, notFoundPayment, type ConfirmResult, type MatchCandidate } from "@/lib/payments";

const id = z.uuid();

export async function confirmAction(paymentId: string): Promise<ActionResult<ConfirmResult>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  const pid = id.safeParse(paymentId);
  if (!pid.success) return { ok: false };
  const result = await confirmPayment(pid.data, admin.id);
  revalidatePath("/admin", "layout");
  return result ? { ok: true, data: result } : { ok: false };
}

export async function notFoundAction(paymentId: string): Promise<ActionResult<{ guest: string }>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  const pid = id.safeParse(paymentId);
  if (!pid.success) return { ok: false };
  const guest = await notFoundPayment(pid.data, admin.id);
  revalidatePath("/admin", "layout");
  return guest ? { ok: true, data: { guest } } : { ok: false };
}

export async function matchAction(query: string): Promise<ActionResult<MatchCandidate[]>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  return { ok: true, data: await matchCandidates(String(query ?? "").slice(0, 60)) };
}

export async function manualConfirmAction(inviteId: string): Promise<ActionResult<ConfirmResult>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  const iid = id.safeParse(inviteId);
  if (!iid.success) return { ok: false };
  const result = await manualConfirm(iid.data, admin.id);
  revalidatePath("/admin", "layout");
  return result ? { ok: true, data: result } : { ok: false };
}
