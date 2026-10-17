"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ComposerSlots, CreateInput, CreateResult, SendResult, ShuffleResult } from "@/components/invite/InviteComposer";
import { t } from "@/lib/copy";
import { createDrafts, sendDraft, shuffleDraft, slotInfo, type Inviter } from "@/lib/invites";
import { currentMember, forgetMember, identifyMember, type Member } from "@/lib/members";
import { clientIp, underLimit } from "@/lib/ratelimit";
import { parseGuestRows } from "@/lib/schemas";

function slotsOf(s: Awaited<ReturnType<typeof slotInfo>>): ComposerSlots {
  return { left: s.unlimited ? null : s.left, total: s.total, unlimited: s.unlimited };
}

/** Identifies the member (number and key, once per phone) and writes one draft per guest. */
export async function createMemberInvites(input: CreateInput): Promise<CreateResult> {
  let member: Member | null = await currentMember();
  if (!member) {
    const h = await headers();
    const phoneDigits = String(input.phone ?? "").replace(/\D/g, "").slice(-10);
    const okIp = await underLimit(`member:ip:${clientIp(h)}`, 30, 3600);
    const okPhone = await underLimit(`member:phone:${phoneDigits}`, 10, 3600);
    if (!okIp || !okPhone) return { ok: false, errors: { identity: t("member.login.error") } };
    const who = await identifyMember(String(input.phone ?? ""), String(input.key ?? ""), h.get("user-agent") ?? "");
    if (!who.ok) {
      return { ok: false, errors: { identity: who.reason === "devices" ? t("member.login.devices_full") : t("member.login.error") } };
    }
    member = who.member;
  }
  const inviter: Inviter = member;
  const identity = { name: member.first_name, slots: slotsOf(await slotInfo(inviter)) };
  const rows = parseGuestRows(input.guests);
  if (!rows.ok) return { ok: false, errors: rows.errors, identity };
  const result = await createDrafts(inviter, rows.value);
  if (!result.ok) return { ok: false, errors: result.errors, identity };
  return { ok: true, data: { drafts: result.drafts, name: member.first_name, slots: identity.slots } };
}

export async function shuffleMemberDraft(id: string): Promise<ShuffleResult> {
  const member = await currentMember();
  if (!member) return { ok: false, message: t("member.login.error") };
  const draft = await shuffleDraft(String(id), member);
  return draft ? { ok: true, data: draft } : { ok: false };
}

export async function sendMemberDraft(id: string): Promise<SendResult> {
  const member = await currentMember();
  if (!member) return { ok: false, message: t("member.login.error") };
  const result = await sendDraft(String(id), member, member.role === "admin" ? "admin" : "member");
  revalidatePath("/m");
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export async function signOutMember(): Promise<void> {
  await forgetMember();
  revalidatePath("/m");
}
