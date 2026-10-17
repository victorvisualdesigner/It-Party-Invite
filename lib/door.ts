// Check in at the door. A ticket code checks in exactly once: the update only matches a paid
// invite that has not been checked in, so two phones scanning together cannot both let it through.
import "server-only";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { normalizeTicketCode } from "@/lib/tickets";

export type DoorResult =
  | { kind: "valid"; guest: string; inviter: string; at: string }
  | { kind: "already"; guest: string; inviter: string; at: string }
  | { kind: "unpaid"; guest: string; inviter: string }
  | { kind: "invalid" };

function formatCode(normalized: string): string | null {
  // PREFIX + 8 characters, stored as XX-XXXX-XXXX.
  const m = normalized.match(/^([A-Z]{2})([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function inviterName(id: string): Promise<string> {
  const { data } = await db().from("people").select("first_name").eq("id", id).maybeSingle();
  return (data?.first_name as string) ?? "";
}

export async function checkInCode(raw: string, adminId: string, at?: string): Promise<DoorResult> {
  const code = formatCode(normalizeTicketCode(raw));
  if (!code) return { kind: "invalid" };
  const when = at && !Number.isNaN(Date.parse(at)) && Date.parse(at) <= Date.now() ? at : new Date().toISOString();
  const { data } = await db()
    .from("invites")
    .update({ checked_in_at: when })
    .eq("ticket_code", code)
    .eq("status", "paid")
    .is("checked_in_at", null)
    .select("id, guest_first_name, inviter_id, checked_in_at")
    .maybeSingle();
  if (data) {
    await audit("admin", adminId, "checked_in", { offline: !!at }, data.id as string);
    return { kind: "valid", guest: data.guest_first_name as string, inviter: await inviterName(data.inviter_id as string), at: data.checked_in_at as string };
  }
  const { data: inv } = await db().from("invites").select("guest_first_name, inviter_id, status, checked_in_at").eq("ticket_code", code).maybeSingle();
  if (!inv) return { kind: "invalid" };
  const inviter = await inviterName(inv.inviter_id as string);
  if (inv.status !== "paid") return { kind: "unpaid", guest: inv.guest_first_name as string, inviter };
  return { kind: "already", guest: inv.guest_first_name as string, inviter, at: inv.checked_in_at as string };
}

export async function checkInById(inviteId: string, adminId: string): Promise<DoorResult> {
  const { data } = await db().from("invites").select("ticket_code").eq("id", inviteId).maybeSingle();
  if (!data?.ticket_code) return { kind: "invalid" };
  return checkInCode(data.ticket_code as string, adminId);
}
