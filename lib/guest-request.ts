// Shared plumbing for the guest page routes: find the invite, check this browser's device cookie,
// and answer with no-store JSON.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getInviteByToken } from "@/lib/invites";
import { inviteCookieName, inviteDeviceMatches } from "@/lib/session";
import type { Invite } from "@/lib/types";

export type GuestContext = { invite: Invite | null; mine: boolean };

export async function guestContext(request: NextRequest, token: string): Promise<GuestContext> {
  const invite = await getInviteByToken(token);
  if (!invite) return { invite: null, mine: false };
  const mine = await inviteDeviceMatches(invite.id, request.cookies.get(inviteCookieName(invite.id))?.value);
  return { invite, mine };
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

/** Reads a small JSON body. Anything malformed becomes an empty object. */
export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (text.length > 4000) return {};
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Only requests from our own pages may change state. */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
