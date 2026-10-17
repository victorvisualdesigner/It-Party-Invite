import type { NextRequest } from "next/server";
import { addNoTaps } from "@/lib/guest";
import { guestContext, json, readBody, sameOrigin } from "@/lib/guest-request";

export const dynamic = "force-dynamic";

/** POST { delta }. The server caps each delta at 20, so a tampered client cannot pad the count. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({}, 403);
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  if (!invite || !mine) return json({}, 403);
  const body = await readBody(request);
  const delta = Math.max(0, Math.min(20, Math.trunc(Number(body.delta) || 0)));
  const taps = await addNoTaps(invite.id, delta);
  return json({ taps });
}
