"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { doorList, type DoorGuest } from "@/lib/admin-data";
import { getEventAdmin } from "@/lib/auth";
import { checkInById, checkInCode, type DoorResult } from "@/lib/door";

export async function checkInAction(code: string, at?: string): Promise<ActionResult<DoorResult>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const result = await checkInCode(admin.eventId, String(code ?? "").slice(0, 40), admin.id, at ? String(at) : undefined);
  revalidatePath("/admin/door");
  return { ok: true, data: result };
}

export async function checkInByIdAction(id: string): Promise<ActionResult<DoorResult>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const iid = z.uuid().safeParse(id);
  if (!iid.success) return { ok: false };
  const result = await checkInById(admin.eventId, iid.data, admin.id);
  revalidatePath("/admin/door");
  return { ok: true, data: result };
}

export async function doorListAction(): Promise<ActionResult<DoorGuest[]>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  return { ok: true, data: await doorList(admin.eventId) };
}
