import type { NextRequest } from "next/server";
import { guestState } from "@/lib/guest";
import { guestContext, json } from "@/lib/guest-request";

export const dynamic = "force-dynamic";

/** The awaiting screen polls this every 10 seconds while it is visible. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  return json(await guestState(invite, mine));
}
