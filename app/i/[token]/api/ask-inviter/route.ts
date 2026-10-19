import type { NextRequest } from "next/server";
import { askInviter, guestState } from "@/lib/guest";
import { guestContext, json, readBody, sameOrigin } from "@/lib/guest-request";
import { getInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";

/**
 * POST {} or { ask: false }. The guest says their inviter is paying for them, or takes it back and
 * pays themselves. Nothing is sent to the inviter from here: the guest sends the WhatsApp line.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({}, 403);
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  if (!invite || !mine) return json({ state: await guestState(invite, mine) });
  const body = await readBody(request);
  await askInviter(invite, body.ask !== false);
  return json({ state: await guestState(await getInvite(invite.id), true) });
}
