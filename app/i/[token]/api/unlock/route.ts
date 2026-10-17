import type { NextRequest } from "next/server";
import { guestState, unlock } from "@/lib/guest";
import { guestContext, json, readBody, sameOrigin } from "@/lib/guest-request";
import { getInvite } from "@/lib/invites";
import { clientIp, underLimit } from "@/lib/ratelimit";
import { cookieOptions, inviteCookieName } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST { phone, key }. Every failure answers the same way and never says which field was wrong.
 * Limits: 5 wrong tries rest the invite for 30 minutes; 30 tries an hour per IP.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return json({ result: "wrong" }, 403);
  const { token } = await ctx.params;
  const body = await readBody(request);
  const phone = String(body.phone ?? "").slice(0, 40);
  const key = String(body.key ?? "").slice(0, 40);

  const { invite, mine } = await guestContext(request, token);
  if (!(await underLimit(`unlock:ip:${clientIp(request.headers)}`, 30, 3600))) {
    return json({ result: "wrong" }, 429);
  }
  const result = await unlock(invite, phone, key, mine, request.headers.get("user-agent") ?? "");

  if (result.kind === "wrong") return json({ result: "wrong", attemptsLeft: result.attemptsLeft });
  if (result.kind === "locked") return json({ result: "locked", minutes: result.minutes });
  if (result.kind === "stranger") return json({ result: "stranger" });
  if (result.kind === "claimed") return json({ result: "claimed" });

  const fresh = invite ? await getInvite(invite.id) : null;
  const response = json({ result: "ok", state: await guestState(fresh, true) });
  if (result.secret && fresh) {
    response.cookies.set(inviteCookieName(fresh.id), result.secret, cookieOptions(`/i/${token}`));
  }
  return response;
}
