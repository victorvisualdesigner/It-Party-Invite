import type { NextRequest } from "next/server";
import { guestState } from "@/lib/guest";
import { guestContext, json, readBody, sameOrigin } from "@/lib/guest-request";
import { getInvite } from "@/lib/invites";
import { claimGuestPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST { sender_name, amount? }: the guest says the transfer is sent. The clock pauses until the
 * admin looks. `amount` (naira) is a part payment, only when the event allows pay small small.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({}, 403);
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  if (!invite || !mine) return json({ state: await guestState(invite, mine) });
  const body = await readBody(request);
  const sender = String(body.sender_name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  let outcome: string | null = null;
  if (sender.length >= 2 && ["said_yes", "awaiting_confirmation"].includes(invite.status)) {
    outcome = await claimGuestPayment(invite, sender, typeof body.amount === "string" || typeof body.amount === "number" ? String(body.amount).slice(0, 20) : undefined);
  }
  return json({ state: await guestState(await getInvite(invite.id), true), ...(outcome === "amount" ? { error: "amount" } : {}) });
}
