// The guest page: one route, every guest state. Served as plain HTML with no framework runtime so it
// paints fast inside WhatsApp's browser on a budget phone. Nothing about the event leaves the server
// until this browser holds a device cookie for this invite.
import type { NextRequest } from "next/server";
import assets from "@/lib/generated/guest-assets.json";
import { appUrl } from "@/lib/env";
import { guestState } from "@/lib/guest";
import { guestPageHtml } from "@/lib/guest-html";
import { guestContext } from "@/lib/guest-request";

export const dynamic = "force-dynamic";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { invite, mine } = await guestContext(request, token);
  const state = await guestState(invite, mine);
  const html = guestPageHtml(state, assets, appUrl());
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": CSP,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
