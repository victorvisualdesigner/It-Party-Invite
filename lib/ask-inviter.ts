// A guest can say, on the transfer screen, that their inviter is paying for them. These rules are
// shared by the guest page, the member list and the admin's Guests table, and need no database.
import type { InviteStatus, Role } from "@/lib/types";
import { isHost } from "@/lib/types";

/** The guest can ask (or stop asking) only while they still owe a transfer. */
export const ASK_STATUSES: InviteStatus[] = ["opened", "said_yes"];

type AskFields = { status: InviteStatus; covered: boolean; pay_requested_at: string | null };

export function canAskInviter(inv: Pick<AskFields, "status" | "covered">): boolean {
  return !inv.covered && ASK_STATUSES.includes(inv.status);
}

/** True while the guest is waiting on their inviter: they asked, and nobody has paid or covered them yet. */
export function isAskingInviter(inv: AskFields): boolean {
  return !!inv.pay_requested_at && canAskInviter(inv);
}

/** Where the inviter pays for a guest: members on their own page, hosts in the portal's Guests list. */
export function inviterPayPath(role: Role): string {
  return isHost(role) ? "/admin/guests" : "/m";
}

/** A host's guest can be let in free by any admin of the event, but only while they are asking. */
export function canLetInFree(inv: AskFields, inviterRole: Role | null): boolean {
  return !!inviterRole && isHost(inviterRole) && isAskingInviter(inv);
}
