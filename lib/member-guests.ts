// The member page's own list: the guests this member invited, and whether they can still pay for them.
import "server-only";
import { isAskingInviter } from "@/lib/ask-inviter";
import { db } from "@/lib/db";
import type { Invite, Payment } from "@/lib/types";

export type MemberGuest = {
  id: string;
  guest: string;
  status: Invite["status"];
  covered: boolean;
  taps: number;
  /** The member's own payment for this guest, if any. */
  payment: Payment["status"] | null;
  /** True while the member can still choose to pay for them. */
  canPay: boolean;
  /** The guest said, on their transfer screen, that this member is paying for them. */
  asked: boolean;
};

const PAYABLE: Invite["status"][] = ["sent", "opened", "said_yes"];

export async function memberGuests(memberId: string, eventId: number): Promise<MemberGuest[]> {
  const { data } = await db()
    .from("invites")
    .select("id, guest_first_name, status, covered, no_taps, sent_at, pay_requested_at")
    .eq("inviter_id", memberId)
    .eq("event_id", eventId)
    .not("status", "in", "(draft,cancelled)")
    .order("sent_at", { ascending: false })
    .limit(100);
  const invites = (data ?? []) as Pick<Invite, "id" | "guest_first_name" | "status" | "covered" | "no_taps" | "pay_requested_at">[];
  if (!invites.length) return [];
  const { data: pays } = await db()
    .from("payments")
    .select("invite_id, status, created_at")
    .in("invite_id", invites.map((i) => i.id))
    .eq("event_id", eventId)
    .eq("payer_type", "member")
    .neq("status", "void")
    .order("created_at", { ascending: true });
  const latest = new Map<string, Payment["status"]>();
  for (const p of pays ?? []) latest.set(p.invite_id as string, p.status as Payment["status"]);
  return invites.map((i) => {
    const payment = latest.get(i.id) ?? null;
    const canPay = !i.covered && PAYABLE.includes(i.status) && payment !== "claimed" && payment !== "confirmed";
    return {
      id: i.id,
      guest: i.guest_first_name,
      status: i.status,
      covered: i.covered,
      taps: i.no_taps,
      payment,
      canPay,
      asked: canPay && isAskingInviter(i),
    };
  });
}
