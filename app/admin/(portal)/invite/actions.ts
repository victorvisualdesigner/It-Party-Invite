"use server";

import { revalidatePath } from "next/cache";
import type { CreateInput, CreateResult, SendResult, ShuffleResult } from "@/components/invite/InviteComposer";
import { getAdmin, type Admin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { createDrafts, sendDraft, shuffleDraft, type Inviter } from "@/lib/invites";
import { parseGuestRows } from "@/lib/schemas";

const UNLIMITED = { left: null, total: null, unlimited: true };
const asInviter = (a: Admin): Inviter => ({ id: a.id, role: a.role, first_name: a.first_name, slot_limit: null });

export async function createAdminInvites(input: CreateInput): Promise<CreateResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, message: t("admin.login.error") };
  const rows = parseGuestRows(input.guests);
  if (!rows.ok) return { ok: false, errors: rows.errors };
  const result = await createDrafts(asInviter(admin), rows.value);
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, data: { drafts: result.drafts, name: admin.first_name, slots: UNLIMITED } };
}

export async function shuffleAdminDraft(id: string): Promise<ShuffleResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false };
  const draft = await shuffleDraft(String(id), asInviter(admin));
  return draft ? { ok: true, data: draft } : { ok: false };
}

export async function sendAdminDraft(id: string): Promise<SendResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false };
  const result = await sendDraft(String(id), asInviter(admin), "admin");
  revalidatePath("/admin", "layout");
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
