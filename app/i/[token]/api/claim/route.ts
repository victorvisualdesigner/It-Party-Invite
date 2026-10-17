import type { NextRequest } from "next/server";
import { guestState } from "@/lib/guest";
import { guestContext, json, readBody, sameOrigin } from "@/lib/guest-request";
import { getInvite } from "@/lib/invites";
import { claimGuestPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** POST { sender_name }: the guest says the transfer is sent. The clock pauses until the admin looks. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({}, 403);
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  if (!invite || !mine) return json({ state: await guestState(invite, mine) });
  const body = await readBody(request);
  const sender = String(body.sender_name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (sender.length >= 2 && ["said_yes", "awaiting_confirmation"].includes(invite.status)) {
    await claimGuestPayment(invite, sender);
  }
  return json({ state: await guestState(await getInvite(invite.id), true) });
}
