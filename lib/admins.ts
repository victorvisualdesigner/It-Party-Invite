// Event admins: the superadmin adds them to an event and removes them. A new admin gets a one time
// setup link on WhatsApp and picks their own password, so nobody types or sends a password for someone else.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { audit } from "@/lib/audit";
import { t } from "@/lib/copy";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { hostLoginUrl } from "@/lib/host-link";
import { getEvent, MIGRATION_HINT } from "@/lib/settings";
import type { Person } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

const SETUP_MS = 72 * 3600e3;
/** Long enough to mean "until someone lifts it". */
const BANNED = "876000h";

export type AdminRow = {
  id: string;
  firstName: string;
  email: string;
  phone: string;
  role: "superadmin" | "admin";
  pending: boolean;
  eventId: number | null;
};

export type SetupDelivery = { name: string; link: string; message: string; waHref: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Every host: the superadmin and each event's admins. */
export async function listAdmins(): Promise<AdminRow[]> {
  const { data, error } = await db()
    .from("people")
    .select("id, first_name, phone_e164, role, email, setup_hash, auth_user_id, event_id, created_at")
    .in("role", ["superadmin", "admin"])
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(/email|setup_hash/.test(error.message) ? MIGRATION_HINT : `Could not load admins: ${error.message}`);
  const rows = (data ?? []) as (Person & { email: string | null })[];
  // The first admin was made by the seed script, before emails were kept here: ask Auth.
  const emails = await Promise.all(
    rows.map(async (p) => {
      if (p.email || !p.auth_user_id) return p.email ?? "";
      const { data: u } = await db().auth.admin.getUserById(p.auth_user_id);
      return u.user?.email ?? "";
    }),
  );
  return rows
    .map((p, i) => ({
      id: p.id,
      firstName: p.first_name,
      email: emails[i],
      phone: p.phone_e164,
      role: p.role as AdminRow["role"],
      pending: !!p.setup_hash,
      eventId: p.event_id,
    }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "superadmin" ? -1 : 1));
}

async function findAuthUser(email: string): Promise<User | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not read sign ins: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function issueLink(person: Pick<Person, "id" | "first_name" | "phone_e164" | "event_id">): Promise<SetupDelivery> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await db()
    .from("people")
    .update({ setup_hash: sha(token), setup_expires_at: new Date(Date.now() + SETUP_MS).toISOString() })
    .eq("id", person.id);
  if (error) throw new Error(`Could not make the setup link: ${error.message}`);
  const event = person.event_id != null ? await getEvent(person.event_id) : null;
  const link = appUrl(`/admin/setup/${token}`);
  // After the one time link, they sign in on their event's own page, never the super admin's.
  const login = event ? hostLoginUrl(event.id) : appUrl("/admin/login");
  const message = t("admin.admins.link_message", { admin: person.first_name, event: event?.name ?? "", link, login });
  return { name: person.first_name, link, message, waHref: waLink(person.phone_e164, message) };
}

export type AddAdminInput = { first_name: string; email: string; phone_e164: string };
export type AddAdminResult = { ok: true; delivery: SetupDelivery } | { ok: false; errors: Record<string, string> };

export async function addAdmin(eventId: number, input: AddAdminInput, actorId: string): Promise<AddAdminResult> {
  const taken = { ok: false as const, errors: { email: t("admin.admins.errors.taken") } };
  const email = input.email.toLowerCase();
  const { data: byPhone } = await db()
    .from("people")
    .select("id, active, auth_user_id")
    .eq("event_id", eventId)
    .eq("phone_e164", input.phone_e164)
    .maybeSingle();
  if (byPhone?.active) return { ok: false, errors: { phone: t("admin.admins.errors.taken") } };
  const { data: byEmail } = await db().from("people").select("id").eq("email", email).eq("active", true).maybeSingle();
  if (byEmail) return taken;

  // A sign in that already exists (someone removed earlier) is reused and unlocked.
  let user = await findAuthUser(email);
  if (user) {
    const { data: owner } = await db().from("people").select("id, active").eq("auth_user_id", user.id).maybeSingle();
    if (owner?.active) return taken;
    const { error } = await db().auth.admin.updateUserById(user.id, { password: randomBytes(24).toString("base64url"), ban_duration: "none", email_confirm: true });
    if (error) throw new Error(`Could not reuse the sign in: ${error.message}`);
    if (owner && owner.id !== byPhone?.id) await db().from("people").update({ auth_user_id: null }).eq("id", owner.id);
  } else {
    const { data, error } = await db().auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create the sign in: ${error?.message}`);
    user = data.user;
  }

  const row = { role: "admin", event_id: eventId, first_name: input.first_name, email, auth_user_id: user.id, slot_limit: null, key_hash: null, active: true };
  const fields = "id, first_name, phone_e164, event_id";
  const saved = byPhone
    ? await db().from("people").update(row).eq("id", byPhone.id).select(fields).single()
    : await db().from("people").insert({ ...row, phone_e164: input.phone_e164 }).select(fields).single();
  if (saved.error || !saved.data) {
    throw new Error(/email|setup_hash|role/.test(saved.error?.message ?? "") ? MIGRATION_HINT : `Could not add the admin: ${saved.error?.message}`);
  }
  await audit("admin", actorId, "admin_added", { admin: input.first_name, person_id: saved.data.id }, null, eventId);
  return { ok: true, delivery: await issueLink(saved.data) };
}

/** A fresh setup link: for an admin who lost theirs, or who forgot their password. */
export async function newSetupLink(personId: string, actorId: string): Promise<SetupDelivery | null> {
  const { data } = await db()
    .from("people")
    .select("id, first_name, phone_e164, event_id")
    .eq("id", personId)
    .eq("role", "admin")
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  await audit("admin", actorId, "admin_link_sent", { admin: data.first_name, person_id: personId });
  return issueLink(data);
}

/** The admin can't sign in any more, at once. Their invites and guests stay as they are. */
export async function removeAdmin(personId: string, actorId: string): Promise<string | null> {
  const { data } = await db()
    .from("people")
    .update({ active: false, setup_hash: null, setup_expires_at: null })
    .eq("id", personId)
    .eq("role", "admin")
    .eq("active", true)
    .select("first_name, auth_user_id, event_id")
    .maybeSingle();
  if (!data) return null;
  if (data.auth_user_id) await db().auth.admin.updateUserById(data.auth_user_id, { ban_duration: BANNED });
  await audit("admin", actorId, "admin_removed", { admin: data.first_name, person_id: personId }, null, data.event_id as number | null);
  return data.first_name;
}

export type SetupTarget = { id: string; firstName: string; email: string; authUserId: string };

/** The admin a setup link belongs to, while the link is still good. */
export async function setupTarget(token: string): Promise<SetupTarget | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data } = await db()
    .from("people")
    .select("id, first_name, email, auth_user_id, setup_expires_at")
    .eq("setup_hash", sha(token))
    .in("role", ["superadmin", "admin"])
    .eq("active", true)
    .maybeSingle();
  if (!data || !data.auth_user_id || !data.setup_expires_at || Date.parse(data.setup_expires_at) < Date.now()) return null;
  return { id: data.id, firstName: data.first_name, email: data.email ?? "", authUserId: data.auth_user_id };
}

/** Sets the password and spends the link. Returns the email to sign in with. */
export async function completeSetup(token: string, password: string): Promise<string | null> {
  const target = await setupTarget(token);
  if (!target) return null;
  const { error } = await db().auth.admin.updateUserById(target.authUserId, { password });
  if (error) throw new Error(`Could not save the password: ${error.message}`);
  await db().from("people").update({ setup_hash: null, setup_expires_at: null }).eq("id", target.id);
  await audit("admin", target.id, "admin_password_set", { admin: target.firstName });
  return target.email;
}
