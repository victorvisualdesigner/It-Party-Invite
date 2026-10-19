"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { getEventAdmin } from "@/lib/auth";
import { cancelInvite, resetAccess, type KeyedMessage } from "@/lib/invites";

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
