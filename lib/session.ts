// Device sessions for guests and members. The cookie holds a random secret; the database holds
// only its sha256. Guests: at most 2 devices per invite. Members: at most 3.
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const DEVICE_MAX_AGE = 120 * 24 * 3600; // seconds
export const GUEST_DEVICE_LIMIT = 2;
export const MEMBER_DEVICE_LIMIT = 3;
export const MEMBER_COOKIE = "mem";

export function newDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cookie name for one invite: inv_ plus the first 12 hex characters of its id. */
export function inviteCookieName(inviteId: string): string {
  return "inv_" + inviteId.replace(/-/g, "").slice(0, 12);
}

export function cookieOptions(path: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge: DEVICE_MAX_AGE,
  };
}

/** True when this browser's cookie matches a device stored for the invite. */
export async function inviteDeviceMatches(inviteId: string, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const hash = hashSecret(secret);
  const { data } = await db().from("invite_devices").select("secret_hash").eq("invite_id", inviteId);
  return (data ?? []).some((row) => sameHash(row.secret_hash, hash));
}

/**
 * Registers this browser for the invite. Returns the new secret, or null when the invite already
 * has its two devices (the database trigger is the final guard against a race).
 */
export async function addInviteDevice(inviteId: string, userAgent: string): Promise<string | null> {
  const secret = newDeviceSecret();
  const { error } = await db()
    .from("invite_devices")
    .insert({ invite_id: inviteId, secret_hash: hashSecret(secret), user_agent: userAgent.slice(0, 300) });
  if (error) {
    if (/device_limit/.test(error.message)) return null;
    throw new Error(`Could not register the device: ${error.message}`);
  }
  return secret;
}

export async function memberForSecret(secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  const { data } = await db().from("member_devices").select("person_id").eq("secret_hash", hashSecret(secret)).maybeSingle();
  return data?.person_id ?? null;
}

export async function addMemberDevice(personId: string, userAgent: string): Promise<string | null> {
  const secret = newDeviceSecret();
  const { error } = await db()
    .from("member_devices")
    .insert({ person_id: personId, secret_hash: hashSecret(secret), user_agent: userAgent.slice(0, 300) });
  if (error) {
    if (/device_limit/.test(error.message)) return null;
    throw new Error(`Could not register the device: ${error.message}`);
  }
  return secret;
}

export async function removeMemberDevice(secret: string): Promise<void> {
  await db().from("member_devices").delete().eq("secret_hash", hashSecret(secret));
}
