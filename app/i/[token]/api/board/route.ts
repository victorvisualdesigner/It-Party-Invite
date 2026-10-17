import type { NextRequest } from "next/server";
import { setBoardVisible } from "@/lib/guest";
import { guestContext, json, readBody, sameOrigin } from "@/lib/guest-request";

export const dynamic = "force-dynamic";

/** POST { on }: the guest shows or hides themselves on the Resistance Board. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({}, 403);
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  if (!invite || !mine) return json({}, 403);
  const body = await readBody(request);
  await setBoardVisible(invite.id, body.on === true);
  return json({ ok: true });
}
