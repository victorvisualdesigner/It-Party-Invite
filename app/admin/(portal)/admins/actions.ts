"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { addAdmin, newSetupLink, removeAdmin, type SetupDelivery } from "@/lib/admins";
import { getAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { parseAdminInput, type AdminInput } from "@/lib/schemas";

const personId = z.uuid();
const notOwner = { ok: false as const, message: t("admin.admins.only_owner") };

export async function addAdminAction(input: AdminInput): Promise<ActionResult<SetupDelivery>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  if (admin.role !== "superadmin") return notOwner;
  const parsed = parseAdminInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const result = await addAdmin(parsed.value, admin.id);
  if (!result.ok) return { ok: false, errors: result.errors };
  revalidatePath("/admin/admins");
  return { ok: true, data: result.delivery };
}

export async function newLinkAction(id: string): Promise<ActionResult<SetupDelivery>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  if (admin.role !== "superadmin") return notOwner;
  const pid = personId.safeParse(id);
  if (!pid.success) return { ok: false };
  const delivery = await newSetupLink(pid.data, admin.id);
  revalidatePath("/admin/admins");
  return delivery ? { ok: true, data: delivery } : { ok: false };
}

export async function removeAdminAction(id: string): Promise<ActionResult<{ firstName: string }>> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  if (admin.role !== "superadmin") return notOwner;
  const pid = personId.safeParse(id);
  if (!pid.success || pid.data === admin.id) return { ok: false };
  const name = await removeAdmin(pid.data, admin.id);
  revalidatePath("/admin/admins");
  return name ? { ok: true, data: { firstName: name } } : { ok: false };
}
