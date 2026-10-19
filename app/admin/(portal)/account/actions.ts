"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { getEventAdmin } from "@/lib/auth";
import { parseAccountInput, type AccountInput } from "@/lib/schemas";
import { addAccount, deleteAccount, setActiveAccount } from "@/lib/settings";

export async function addAccountAction(input: AccountInput): Promise<ActionResult> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const parsed = parseAccountInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  await addAccount(admin.eventId, parsed.value, admin.id);
  revalidatePath("/admin/account");
  return { ok: true };
}

export async function setActiveAccountAction(accountId: string): Promise<ActionResult> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const id = z.uuid().safeParse(accountId);
  if (!id.success) return { ok: false };
  const done = await setActiveAccount(admin.eventId, id.data, admin.id);
  revalidatePath("/admin/account");
  return done ? { ok: true } : { ok: false };
}

export async function deleteAccountAction(accountId: string): Promise<ActionResult<{ archived: boolean; nowActive: string | null }>> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const id = z.uuid().safeParse(accountId);
  if (!id.success) return { ok: false };
  const result = await deleteAccount(admin.eventId, id.data, admin.id);
  revalidatePath("/admin/account");
  return result.ok ? { ok: true, data: { archived: result.archived, nowActive: result.nowActive } } : { ok: false, message: result.message };
}
