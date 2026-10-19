// Each event's own sign in page for its admins: /host/{code}. The code is the event id plus a
// signature made with SESSION_SECRET, so nobody can reach an event's page by counting ids, and
// nothing new is stored in the database.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl, env } from "@/lib/env";

const SIG_LENGTH = 12;

function signature(eventId: number, secret: string): string {
  return createHmac("sha256", secret).update(`host-login:${eventId}`).digest("base64url").slice(0, SIG_LENGTH);
}

export function hostCode(eventId: number, secret: string = env().SESSION_SECRET): string {
  return `${eventId}-${signature(eventId, secret)}`;
}

/** The event a code opens, or null when the code was not made by this app. */
export function eventFromHostCode(code: string, secret: string = env().SESSION_SECRET): number | null {
  const match = /^([1-9]\d{0,4})-([A-Za-z0-9_-]+)$/.exec(code);
  if (!match || match[2].length !== SIG_LENGTH) return null;
  const eventId = Number(match[1]);
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(signature(eventId, secret));
  return timingSafeEqual(given, expected) ? eventId : null;
}

export function hostLoginPath(eventId: number): string {
  return `/host/${hostCode(eventId)}`;
}

export function hostLoginUrl(eventId: number): string {
  return appUrl(hostLoginPath(eventId));
}
