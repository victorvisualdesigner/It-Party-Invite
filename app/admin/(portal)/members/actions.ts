"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { getEventAdmin } from "@/lib/auth";
import { addMember, removeMember, resetMemberKey, setSlots, type KeyDelivery } from "@/lib/people";
import { parseMemberInput, parseSlotLimit, type MemberInput } from "@/lib/schemas";

const personId = z.uuid();

export async function addMemberAction(input: MemberInput): Promise<ActionResult<KeyDelivery>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const parsed = parseMemberInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const result = await addMember(admin.eventId, parsed.value, admin.id);
  if (!result.ok) return { ok: false, errors: result.errors };
  revalidatePath("/admin/members");
  return { ok: true, data: result.delivery };
}

export async function setSlotsAction(id: string, value: string): Promise<ActionResult> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const pid = personId.safeParse(id);
  const limit = parseSlotLimit(value);
  if (!pid.success || !limit.ok) return { ok: false };
  const done = await setSlots(admin.eventId, pid.data, limit.value, admin.id);
  revalidatePath("/admin/members");
  return done ? { ok: true } : { ok: false };
}

export async function resetKeyAction(id: string): Promise<ActionResult<KeyDelivery>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const pid = personId.safeParse(id);
  if (!pid.success) return { ok: false };
  const delivery = await resetMemberKey(admin.eventId, pid.data, admin.id);
  return delivery ? { ok: true, data: delivery } : { ok: false };
}

export async function removeMemberAction(id: string): Promise<ActionResult<{ firstName: string }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const pid = personId.safeParse(id);
  if (!pid.success) return { ok: false };
  const firstName = await removeMember(admin.eventId, pid.data, admin.id);
  revalidatePath("/admin/members");
  return firstName ? { ok: true, data: { firstName } } : { ok: false };
}
