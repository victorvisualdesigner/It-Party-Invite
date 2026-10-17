// Members on the invite page: identified once by number and key, then remembered on this phone.
import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyKey } from "@/lib/keys";
import { normalizePhone } from "@/lib/phone";
import { addMemberDevice, cookieOptions, MEMBER_COOKIE, memberForSecret, removeMemberDevice } from "@/lib/session";
import type { Person } from "@/lib/types";

export type Member = Pick<Person, "id" | "role" | "first_name" | "slot_limit" | "phone_e164">;

const FIELDS = "id, role, first_name, slot_limit, phone_e164";

/** The member remembered on this phone, if any. */
export async function currentMember(): Promise<Member | null> {
  const store = await cookies();
  const personId = await memberForSecret(store.get(MEMBER_COOKIE)?.value);
  if (!personId) return null;
  const { data } = await db().from("people").select(FIELDS).eq("id", personId).eq("active", true).maybeSingle();
  return (data as Member | null) ?? null;
}

export type IdentifyResult = { ok: true; member: Member } | { ok: false; reason: "mismatch" | "devices" };

/** Number and key, checked against active people. The phone is remembered for 120 days. */
export async function identifyMember(phone: string, key: string, userAgent: string): Promise<IdentifyResult> {
  const e164 = normalizePhone(phone);
  if (!e164) return { ok: false, reason: "mismatch" };
  const { data } = await db().from("people").select(`${FIELDS}, key_hash`).eq("phone_e164", e164).eq("active", true).maybeSingle();
  if (!data || !(await verifyKey(key, data.key_hash as string | null))) return { ok: false, reason: "mismatch" };
  const secret = await addMemberDevice(data.id as string, userAgent);
  if (!secret) return { ok: false, reason: "devices" };
  const store = await cookies();
  store.set(MEMBER_COOKIE, secret, cookieOptions("/m"));
  const { key_hash: _hidden, ...member } = data;
  void _hidden;
  return { ok: true, member: member as Member };
}

export async function forgetMember(): Promise<void> {
  const store = await cookies();
  const secret = store.get(MEMBER_COOKIE)?.value;
  if (secret) await removeMemberDevice(secret);
  store.set(MEMBER_COOKIE, "", { ...cookieOptions("/m"), maxAge: 0 });
}
