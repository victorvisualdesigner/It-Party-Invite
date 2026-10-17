import type { NextRequest } from "next/server";
import { guestState, sayYes } from "@/lib/guest";
import { guestContext, json, sameOrigin } from "@/lib/guest-request";
import { getInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";

/** The guest tapped Yes. There is no endpoint for No: No can never be pressed. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({}, 403);
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  if (!invite || !mine) return json({ kind: "refresh", state: await guestState(invite, mine) });
  const result = await sayYes(invite);
  const state = await guestState(await getInvite(invite.id), true);
  if (result.kind === "payment") return json({ kind: "payment", payment: result.payment, state });
  return json({ kind: result.kind, state });
}
