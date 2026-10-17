"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/copy";
import { adminForAuthUser, authClient } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/lib/action";

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

export async function signOut(): Promise<void> {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
