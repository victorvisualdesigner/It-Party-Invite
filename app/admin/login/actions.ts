"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/copy";
import { adminForAuthUser, authClient, getAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/lib/action";
import { db } from "@/lib/db";
import { eventFromHostCode, hostLoginPath } from "@/lib/host-link";

const signInSchema = z.object({
  email: z.string().trim().max(320),
  password: z.string().max(200),
});

/** Email and password sign in. Any failure gives the same message. */
export async function signIn(input: { email: string; password: string }): Promise<ActionResult> {
  const fail = { ok: false as const, message: t("admin.login.error") };
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success || !parsed.data.email || !parsed.data.password) return fail;

  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return fail;

  // A valid Supabase user is not enough: they must be an active admin in the people table.
  const admin = await adminForAuthUser(data.user.id);
  if (!admin) {
    await supabase.auth.signOut();
    return fail;
  }
  await audit("admin", admin.id, "admin_signed_in");
  return { ok: true };
}

/**
 * One event's admin sign in, from /host/{code}. Only an active admin of that event gets in; the
 * super admin and other events' admins are turned away with the same message as a wrong password.
 */
export async function signInToEvent(code: string, input: { email: string; password: string }): Promise<ActionResult> {
  const fail = { ok: false as const, message: t("admin.login.error") };
  const eventId = eventFromHostCode(String(code));
  const parsed = signInSchema.safeParse(input);
  if (eventId == null || !parsed.success || !parsed.data.email || !parsed.data.password) return fail;

  // Check the email first, so a wrong account never replaces whoever is signed in on this browser.
  const email = parsed.data.email.toLowerCase();
  const { data: person } = await db()
    .from("people")
    .select("id")
    .eq("event_id", eventId)
    .eq("role", "admin")
    .eq("active", true)
    .eq("email", email)
    .maybeSingle();
  if (!person) return fail;

  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error || !data.user) return fail;
  const admin = await adminForAuthUser(data.user.id);
  if (!admin || admin.role !== "admin" || admin.event_id !== eventId) {
    await supabase.auth.signOut({ scope: "local" });
    return fail;
  }
  await audit("admin", admin.id, "admin_signed_in", { via: "event_link" });
  return { ok: true };
}

/** Event admins go back to their own event's sign in page; the super admin to the host login. */
export async function signOut(): Promise<void> {
  const admin = await getAdmin();
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect(admin?.role === "admin" && admin.event_id != null ? hostLoginPath(admin.event_id) : "/admin/login");
}
